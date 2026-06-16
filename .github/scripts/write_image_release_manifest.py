import argparse
import json
import os
from pathlib import Path


def append_github_output(name: str, value: str) -> None:
    github_output = os.getenv("GITHUB_OUTPUT")
    if not github_output:
        return

    with open(github_output, "a", encoding="utf-8") as handle:
        handle.write(f"{name}={value}\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Write a small image release manifest for GitHub Actions handoff."
    )
    parser.add_argument("--service", required=True)
    parser.add_argument("--terraform-var")
    parser.add_argument("--repository", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--digest", required=True)
    parser.add_argument("--git-revision", required=True)
    parser.add_argument("--git-ref", required=True)
    parser.add_argument("--git-commit-subject", required=True)
    parser.add_argument("--workflow", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    image_tag = f"{args.repository}:{args.tag}"
    image_ref = f"{args.repository}@{args.digest}"
    short_git_revision = args.git_revision[:7]
    terraform_export = (
        f"{args.terraform_var}={image_ref}" if args.terraform_var else ""
    )
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    manifest = {
        "service": args.service,
        "gitRevision": args.git_revision,
        "gitShortRevision": short_git_revision,
        "gitRef": args.git_ref,
        "gitCommitSubject": args.git_commit_subject,
        "workflow": args.workflow,
        "imageTag": image_tag,
        "imageDigest": args.digest,
        "imageRef": image_ref,
    }
    if args.terraform_var:
        manifest["terraformVariable"] = args.terraform_var
        manifest["terraformExport"] = terraform_export

    output_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    append_github_output("image_ref", image_ref)
    append_github_output("terraform_export", terraform_export)
    append_github_output("has_terraform_export", "true" if terraform_export else "false")
    append_github_output("manifest_path", str(output_path))
    append_github_output("git_commit_subject", args.git_commit_subject)
    append_github_output("short_git_revision", short_git_revision)


if __name__ == "__main__":
    main()
