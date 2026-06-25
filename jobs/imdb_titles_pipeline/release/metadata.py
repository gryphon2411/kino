import argparse
from pathlib import Path

from ..commons import read_json
from .publish import collect_release_metadata


def emit_artifact_metadata(artifacts_dir: Path) -> dict[str, str]:
    metadata = collect_release_metadata(artifacts_dir)
    seed_manifest = read_json(artifacts_dir / "mongo-seed" / "manifest.json")

    return {
        "dataset_version": metadata["datasetVersion"],
        "transform_version": metadata["transformVersion"],
        "raw_source_sha256": metadata["rawSourceSha256"],
        "raw_manifest_sha256": metadata["rawManifestSha256"],
        "curated_manifest_sha256": metadata["curatedManifestSha256"],
        "seed_manifest_sha256": metadata["seedManifestSha256"],
        "seed_documents": str(seed_manifest["stats"]["documents"]),
    }


def main() -> None:
    jobs_dir = Path(__file__).resolve().parents[2]

    parser = argparse.ArgumentParser(
        description="Emit artifact metadata as key=value pairs for GitHub Actions outputs."
    )
    parser.add_argument("--artifacts-dir", default=str(jobs_dir / ".artifacts"))
    args = parser.parse_args()

    metadata = emit_artifact_metadata(Path(args.artifacts_dir).resolve())
    for key, value in metadata.items():
        print(f"{key}={value}")


if __name__ == "__main__":
    main()
