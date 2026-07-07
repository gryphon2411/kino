import argparse
import json
import os
import sys
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

PREVIEW_TAG_PREFIX = "pr"
PREVIEW_SHA_LENGTH = 12
GITHUB_ACCEPT_HEADER = "application/vnd.github+json"
GITHUB_API_VERSION = "2022-11-28"


@dataclass(frozen=True)
class PublishDecision:
    should_publish: bool
    publish_kind: str
    resolved_tag: str = ""
    non_publish_reason: str = ""
    pull_request_number: str = ""


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Resolve whether a GitHub Actions image workflow should publish."
    )
    parser.add_argument("--canonical-ref", required=True)
    parser.add_argument("--canonical-tag", required=True)
    args = parser.parse_args()

    decision = resolve_publish_decision(args.canonical_ref, args.canonical_tag)
    emit_github_outputs(decision)


def resolve_publish_decision(canonical_ref: str, canonical_tag: str) -> PublishDecision:
    event_name = os.getenv("GITHUB_EVENT_NAME", "")
    git_ref = os.getenv("GITHUB_REF", "")
    git_ref_name = os.getenv("GITHUB_REF_NAME", "") or branch_name_from_ref(git_ref)
    git_revision = os.getenv("GITHUB_SHA", "")
    event_payload = read_event_payload(os.getenv("GITHUB_EVENT_PATH", ""))

    if event_name == "push" and git_ref == canonical_ref:
        return PublishDecision(True, "canonical", canonical_tag)

    if event_name == "workflow_dispatch":
        return resolve_workflow_dispatch_decision(
            canonical_ref,
            canonical_tag,
            git_ref,
            git_ref_name,
            git_revision,
            event_payload,
        )

    return PublishDecision(
        False, "validation", non_publish_reason="This run will validate only."
    )


def resolve_workflow_dispatch_decision(
    canonical_ref: str,
    canonical_tag: str,
    git_ref: str,
    git_ref_name: str,
    git_revision: str,
    event_payload: dict[str, Any],
) -> PublishDecision:
    if not is_publish_requested("workflow_dispatch", event_payload):
        non_publish_reason = "publish_image=false"
        return PublishDecision(False, "validation", non_publish_reason=non_publish_reason)

    if git_ref == canonical_ref:
        return PublishDecision(True, "canonical", canonical_tag)

    selected_branch = branch_name_from_ref(git_ref)
    if not selected_branch:
        non_publish_reason = (
            "selected ref is not a branch, so it cannot qualify for PR preview publish"
        )
        return PublishDecision(False, "validation", non_publish_reason=non_publish_reason)

    repository = os.getenv("GITHUB_REPOSITORY", "")
    github_token = os.getenv("GITHUB_TOKEN", "")
    if not repository:
        raise SystemExit("GITHUB_REPOSITORY is required for preview publish lookup.")
    if not github_token:
        raise SystemExit("GITHUB_TOKEN is required for preview publish lookup.")

    target_branch = canonical_branch_name(canonical_ref)
    pull_requests = query_open_pull_requests(
        repository=repository,
        head_branch=git_ref_name or selected_branch,
        base_branch=target_branch,
        github_token=github_token,
    )

    if not pull_requests:
        non_publish_reason = f"selected ref has no open PR to {target_branch}"
        return PublishDecision(False, "validation", non_publish_reason=non_publish_reason)

    if len(pull_requests) != 1:
        raise SystemExit(
            "Preview publish is ambiguous because multiple open PRs match "
            f"{git_ref_name or selected_branch} -> {target_branch}."
        )

    pull_request_number = pull_requests[0].get("number")
    if not isinstance(pull_request_number, int):
        raise SystemExit("GitHub pull request lookup returned an invalid PR number.")

    resolved_tag = build_preview_tag(pull_request_number, git_revision)
    pull_request_number_value = str(pull_request_number)
    return PublishDecision(True, "pr_preview", resolved_tag, pull_request_number=pull_request_number_value)


def read_event_payload(event_path: str) -> dict[str, Any]:
    if not event_path:
        return {}

    with open(event_path, encoding="utf-8") as handle:
        payload = json.load(handle)

    if not isinstance(payload, dict):
        raise SystemExit("GitHub event payload must be a JSON object.")

    return payload


def is_publish_requested(event_name: str, event_payload: dict[str, Any]) -> bool:
    if event_name != "workflow_dispatch":
        return False

    requested = event_payload.get("inputs", {}).get("publish_image", "false")
    return str(requested).lower() == "true"


def branch_name_from_ref(ref: str) -> str:
    prefix = "refs/heads/"
    if ref.startswith(prefix):
        return ref[len(prefix):]
    return ""


def canonical_branch_name(canonical_ref: str) -> str:
    branch_name = branch_name_from_ref(canonical_ref)
    if not branch_name:
        raise SystemExit(
            f"Canonical publish ref '{canonical_ref}' must use refs/heads/<branch>."
        )
    return branch_name


def query_open_pull_requests(
    repository: str, head_branch: str, base_branch: str, github_token: str
) -> list[dict[str, Any]]:
    github_api_url = os.getenv("GITHUB_API_URL", "https://api.github.com").rstrip("/")
    repository_owner = github_repository_owner(repository)
    query_string = urlencode(
        {
            "state": "open",
            "head": f"{repository_owner}:{head_branch}",
            "base": base_branch,
            "per_page": "100",
        }
    )
    request_url = f"{github_api_url}/repos/{repository}/pulls?{query_string}"
    request = Request(
        request_url,
        headers={
            "Accept": GITHUB_ACCEPT_HEADER,
            "Authorization": f"Bearer {github_token}",
            "User-Agent": "kino-workflow-publish-helper",
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
    )

    try:
        with urlopen(request) as response:
            payload = json.load(response)
    except HTTPError as error:
        error_body = error.read().decode("utf-8", errors="ignore")
        raise SystemExit(
            "Failed to query GitHub pull requests: "
            f"{error.code} {error.reason}. {error_body}"
        ) from error
    except URLError as error:
        raise SystemExit(
            f"Failed to reach the GitHub API while resolving preview publish: {error}"
        ) from error

    if not isinstance(payload, list):
        raise SystemExit("GitHub pull request lookup did not return a list.")

    return payload


def github_repository_owner(repository: str) -> str:
    owner, _, _ = repository.partition("/")
    if not owner:
        raise SystemExit("GITHUB_REPOSITORY must be set to owner/repo.")
    return owner


def build_preview_tag(pull_request_number: int, git_revision: str) -> str:
    return (
        f"{PREVIEW_TAG_PREFIX}-{pull_request_number}-"
        f"{git_revision[:PREVIEW_SHA_LENGTH]}"
    )


def emit_github_outputs(decision: PublishDecision) -> None:
    append_github_output("should_publish", str(decision.should_publish).lower())
    append_github_output("publish_kind", decision.publish_kind)
    append_github_output("resolved_tag", decision.resolved_tag)
    append_github_output("non_publish_reason", decision.non_publish_reason)
    append_github_output("pull_request_number", decision.pull_request_number)


def append_github_output(name: str, value: str) -> None:
    github_output = os.getenv("GITHUB_OUTPUT")
    if not github_output:
        return

    with open(github_output, "a", encoding="utf-8") as handle:
        handle.write(f"{name}={value}\n")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as error:
        message = str(error)
        if message:
            print(message, file=sys.stderr)
        raise
