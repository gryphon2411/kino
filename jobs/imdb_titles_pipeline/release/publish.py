import argparse
import json
import os
from pathlib import Path

from ..commons import RAW_ARCHIVE_NAME, compute_sha256, read_json, run_command, write_json
from ..validation import ArtifactValidator

RAW_DIRNAME = "raw-imdb"
CURATED_DIRNAME = "curated-titles"
SEED_DIRNAME = "mongo-seed"
MANIFEST_FILENAME = "manifest.json"
RELEASE_MANIFEST_FILENAME = "release-manifest.json"


def read_command_output(
    command: list[str],
    *,
    cwd: Path,
    input_text: str | None = None,
) -> str:
    result = run_command(command, cwd=cwd, input=input_text)
    return result.stdout.strip()


def validate_release_lineage(
    raw_manifest: dict[str, object],
    curated_manifest: dict[str, object],
    seed_manifest: dict[str, object],
) -> None:
    if curated_manifest.get("source") != raw_manifest:
        raise ValueError(
            "Curated manifest source does not match the standalone raw manifest. "
            "Rebuild jobs/.artifacts so the release uses one coherent lineage."
        )

    if seed_manifest.get("source") != curated_manifest:
        raise ValueError(
            "Seed manifest source does not match the standalone curated manifest. "
            "Rebuild jobs/.artifacts so the release uses one coherent lineage."
        )


def collect_release_metadata(
    artifacts_dir: Path,
    validator: ArtifactValidator | None = None,
) -> dict[str, str]:
    validator = validator or ArtifactValidator()

    raw_manifest_path = artifacts_dir / RAW_DIRNAME / MANIFEST_FILENAME
    curated_manifest_path = artifacts_dir / CURATED_DIRNAME / MANIFEST_FILENAME
    seed_manifest_path = artifacts_dir / SEED_DIRNAME / MANIFEST_FILENAME

    raw_manifest = read_json(raw_manifest_path)
    curated_manifest = read_json(curated_manifest_path)
    seed_manifest = read_json(seed_manifest_path)

    raw_archive_path = artifacts_dir / RAW_DIRNAME / RAW_ARCHIVE_NAME
    curated_dir = artifacts_dir / CURATED_DIRNAME
    seed_dir = artifacts_dir / SEED_DIRNAME

    raw_dataset_version, raw_source_sha256 = validator.validate_raw_manifest(
        raw_manifest,
        raw_archive_path,
    )
    curated_dataset_version, curated_source_sha256 = validator.validate_curated_manifest(
        curated_manifest,
        curated_dir,
    )
    seed_dataset_version = validator.validate_seed_manifest(seed_manifest, seed_dir)

    validate_release_lineage(raw_manifest, curated_manifest, seed_manifest)

    if curated_dataset_version != raw_dataset_version:
        raise ValueError("Curated manifest datasetVersion does not match the raw artifact.")
    if curated_source_sha256 != raw_source_sha256:
        raise ValueError("Curated manifest source checksum does not match the raw artifact.")
    if seed_dataset_version != raw_dataset_version:
        raise ValueError("Seed manifest datasetVersion does not match the raw artifact.")

    dataset_version = curated_dataset_version
    transform_version = curated_manifest["transformVersion"]

    if seed_manifest["datasetVersion"] != dataset_version:
        raise ValueError("Seed manifest datasetVersion does not match the curated artifact.")
    if seed_manifest["transformVersion"] != transform_version:
        raise ValueError("Seed manifest transformVersion does not match the curated artifact.")
    if not seed_manifest.get("source", {}).get("qualityGate", {}).get("passed", False):
        raise ValueError("Seed manifest source curated artifact did not pass the quality gate.")

    return {
        "datasetVersion": dataset_version,
        "transformVersion": transform_version,
        "rawSourceSha256": raw_source_sha256,
        "rawManifestSha256": compute_sha256(raw_manifest_path),
        "curatedManifestSha256": compute_sha256(curated_manifest_path),
        "seedManifestSha256": compute_sha256(seed_manifest_path),
    }


def resolve_repository(explicit_repository: str | None) -> str:
    if explicit_repository:
        return explicit_repository

    dockerhub_username = os.getenv("DOCKERHUB_USERNAME")
    if dockerhub_username:
        return f"{dockerhub_username}/kino-mongo-seed"

    raise ValueError(
        "Set DOCKERHUB_USERNAME or pass --repository to publish the Mongo seed image."
    )


def login_to_docker_if_configured(*, jobs_dir: Path) -> None:
    dockerhub_username = os.getenv("DOCKERHUB_USERNAME")
    dockerhub_token = os.getenv("DOCKERHUB_TOKEN")
    if dockerhub_username and dockerhub_token:
        read_command_output(
            ["docker", "login", "--username", dockerhub_username, "--password-stdin"],
            cwd=jobs_dir,
            input_text=f"{dockerhub_token}\n",
        )


def resolve_repo_digest(*, image_tag: str, repository: str, jobs_dir: Path) -> str:
    repo_digests_raw = read_command_output(
        ["docker", "image", "inspect", image_tag, "--format", "{{json .RepoDigests}}"],
        cwd=jobs_dir,
    )
    repo_digests = json.loads(repo_digests_raw)
    repository_prefix = f"{repository}@sha256:"
    for repo_digest in repo_digests:
        if repo_digest.startswith(repository_prefix):
            return repo_digest

    raise ValueError(f"Could not resolve a repo digest for {image_tag}.")


def build_release_manifest(
    *,
    git_revision: str,
    metadata: dict[str, str],
    mongo_seed_image_ref: str,
) -> dict[str, str]:
    return {
        "gitRevision": git_revision,
        "datasetVersion": metadata["datasetVersion"],
        "transformVersion": metadata["transformVersion"],
        "rawSourceSha256": metadata["rawSourceSha256"],
        "rawManifestSha256": metadata["rawManifestSha256"],
        "curatedManifestSha256": metadata["curatedManifestSha256"],
        "seedManifestSha256": metadata["seedManifestSha256"],
        "mongoSeedImageRef": mongo_seed_image_ref,
    }


def publish_mongo_seed(
    *,
    jobs_dir: Path,
    artifacts_dir: Path,
    dockerfile: Path,
    repository: str | None,
    manifest_output_path: Path,
) -> dict[str, str]:
    metadata = collect_release_metadata(artifacts_dir)
    resolved_repository = resolve_repository(repository)
    image_tag = f"{resolved_repository}:{metadata['datasetVersion']}"

    login_to_docker_if_configured(jobs_dir=jobs_dir)

    docker_build_command = [
        "docker",
        "build",
        "-f",
        str(dockerfile),
        "-t",
        image_tag,
        "--build-arg",
        f"DATASET_VERSION={metadata['datasetVersion']}",
        "--build-arg",
        f"MANIFEST_SHA256={metadata['seedManifestSha256']}",
        "--build-arg",
        f"SOURCE_SHA256={metadata['rawSourceSha256']}",
        "--build-arg",
        f"TRANSFORM_VERSION={metadata['transformVersion']}",
        str(jobs_dir),
    ]
    read_command_output(docker_build_command, cwd=jobs_dir)
    
    docker_push_command = ["docker", "push", image_tag]
    read_command_output(docker_push_command, cwd=jobs_dir)

    mongo_seed_image_ref = resolve_repo_digest(
        image_tag=image_tag,
        repository=resolved_repository,
        jobs_dir=jobs_dir,
    )
    git_revision = read_command_output(["git", "rev-parse", "HEAD"], cwd=jobs_dir)
    release_manifest = build_release_manifest(
        git_revision=git_revision,
        metadata=metadata,
        mongo_seed_image_ref=mongo_seed_image_ref,
    )

    manifest_output_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(manifest_output_path, release_manifest)
    return release_manifest


def main() -> None:
    jobs_dir = Path(__file__).resolve().parents[2]

    parser = argparse.ArgumentParser(
        description="Build, push, and record the digest-pinned Mongo seed image."
    )
    parser.add_argument("--jobs-dir", default=str(jobs_dir))
    parser.add_argument("--artifacts-dir", default=str(jobs_dir / ".artifacts"))
    parser.add_argument("--dockerfile", default=str(jobs_dir / "images" / "mongo-seed" / "Dockerfile"))
    parser.add_argument("--repository", default=None)
    parser.add_argument(
        "--manifest-output",
        default=str(jobs_dir / ".artifacts" / RELEASE_MANIFEST_FILENAME),
    )
    args = parser.parse_args()

    release_manifest = publish_mongo_seed(
        jobs_dir=Path(args.jobs_dir).resolve(),
        artifacts_dir=Path(args.artifacts_dir).resolve(),
        dockerfile=Path(args.dockerfile).resolve(),
        repository=args.repository,
        manifest_output_path=Path(args.manifest_output).resolve(),
    )

    print(json.dumps(release_manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
