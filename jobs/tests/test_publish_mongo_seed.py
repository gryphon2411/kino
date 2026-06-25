import hashlib
import gzip
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from imdb_titles_pipeline.commons import (  # noqa: E402
    CURATED_FILENAME,
    EXPECTED_COLUMNS,
    QUARANTINE_FILENAME,
    RAW_ARCHIVE_NAME,
    SCHEMA_VERSION,
    TRANSFORM_VERSION,
    compute_sha256,
    create_empty_parquet,
    derive_dataset_version,
    file_metadata,
    header_fingerprint,
)
from imdb_titles_pipeline.mongo.definitions import MONGO_SEED_ARCHIVE_NAME  # noqa: E402
from imdb_titles_pipeline.release.publish import (  # noqa: E402
    build_release_manifest,
    collect_release_metadata,
    publish_mongo_seed,
    resolve_repository,
)


class PublishMongoSeedTests(unittest.TestCase):
    def write_raw_artifact(self, raw_dir: Path, raw_tsv: str) -> dict[str, object]:
        raw_archive_path = raw_dir / RAW_ARCHIVE_NAME
        with gzip.open(raw_archive_path, "wt", encoding="utf-8", newline="") as archive_file:
            archive_file.write(raw_tsv)

        raw_sha256 = compute_sha256(raw_archive_path)
        dataset_version = derive_dataset_version(raw_sha256)
        raw_manifest = {
            "capturedAt": "2026-01-01T00:00:00Z",
            "datasetVersion": dataset_version,
            "rawSchemaVersion": SCHEMA_VERSION,
            "sourceUrl": "https://datasets.imdbws.com/title.basics.tsv.gz",
            "source": {
                "headerColumns": list(EXPECTED_COLUMNS),
                "headerFingerprint": header_fingerprint(EXPECTED_COLUMNS),
            },
            "artifact": file_metadata(raw_archive_path),
        }
        (raw_dir / "manifest.json").write_text(json.dumps(raw_manifest), encoding="utf-8")
        return raw_manifest

    def write_release_artifacts(self, artifacts_dir: Path) -> dict[str, object]:
        raw_dir = artifacts_dir / "raw-imdb"
        curated_dir = artifacts_dir / "curated-titles"
        seed_dir = artifacts_dir / "mongo-seed"
        raw_dir.mkdir(parents=True)
        curated_dir.mkdir(parents=True)
        seed_dir.mkdir(parents=True)

        raw_header = "\t".join(EXPECTED_COLUMNS) + "\n"
        raw_manifest = self.write_raw_artifact(raw_dir, raw_header)

        curated_parquet_path = curated_dir / CURATED_FILENAME
        create_empty_parquet(curated_parquet_path)
        quarantine_path = curated_dir / QUARANTINE_FILENAME
        with gzip.open(quarantine_path, "wt", encoding="utf-8") as quarantine_file:
            quarantine_file.write("")

        curated_manifest = {
            "datasetVersion": raw_manifest["datasetVersion"],
            "schemaVersion": SCHEMA_VERSION,
            "transformVersion": TRANSFORM_VERSION,
            "source": raw_manifest,
            "qualityGate": {"passed": True},
            "stats": {"inputRows": 0, "acceptedRows": 0, "rejectedRows": 0},
            "artifacts": {
                CURATED_FILENAME: file_metadata(curated_parquet_path),
                QUARANTINE_FILENAME: file_metadata(quarantine_path),
            },
        }
        curated_manifest_path = curated_dir / "manifest.json"
        curated_manifest_path.write_text(json.dumps(curated_manifest), encoding="utf-8")

        seed_archive_path = seed_dir / MONGO_SEED_ARCHIVE_NAME
        with gzip.open(seed_archive_path, "wb") as archive_file:
            archive_file.write(b"seed")

        seed_manifest = {
            "datasetVersion": raw_manifest["datasetVersion"],
            "schemaVersion": SCHEMA_VERSION,
            "transformVersion": TRANSFORM_VERSION,
            "source": curated_manifest,
            "stats": {"documents": 0},
            "artifacts": {
                MONGO_SEED_ARCHIVE_NAME: file_metadata(seed_archive_path),
            },
        }
        seed_manifest_path = seed_dir / "manifest.json"
        seed_manifest_path.write_text(json.dumps(seed_manifest), encoding="utf-8")

        return {
            "raw_manifest": raw_manifest,
            "curated_manifest": curated_manifest,
            "seed_manifest": seed_manifest,
            "raw_manifest_path": raw_dir / "manifest.json",
            "curated_manifest_path": curated_manifest_path,
            "seed_manifest_path": seed_manifest_path,
            "raw_dir": raw_dir,
        }

    def test_collect_release_metadata_reads_expected_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            artifacts_dir = Path(temp_dir_name)
            artifacts = self.write_release_artifacts(artifacts_dir)
            raw_manifest = artifacts["raw_manifest"]
            curated_manifest = artifacts["curated_manifest"]
            raw_manifest_path = artifacts["raw_manifest_path"]
            curated_manifest_path = artifacts["curated_manifest_path"]
            seed_manifest_path = artifacts["seed_manifest_path"]

            metadata = collect_release_metadata(artifacts_dir)

            self.assertEqual(metadata["datasetVersion"], curated_manifest["datasetVersion"])
            self.assertEqual(metadata["transformVersion"], curated_manifest["transformVersion"])
            self.assertEqual(metadata["rawSourceSha256"], raw_manifest["artifact"]["sha256"])
            self.assertEqual(
                metadata["rawManifestSha256"],
                hashlib.sha256(raw_manifest_path.read_bytes()).hexdigest(),
            )
            self.assertEqual(
                metadata["curatedManifestSha256"],
                hashlib.sha256(curated_manifest_path.read_bytes()).hexdigest(),
            )
            self.assertEqual(
                metadata["seedManifestSha256"],
                hashlib.sha256(seed_manifest_path.read_bytes()).hexdigest(),
            )

    def test_collect_release_metadata_rejects_mixed_release_lineage(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            artifacts_dir = Path(temp_dir_name)
            artifacts = self.write_release_artifacts(artifacts_dir)
            raw_dir = artifacts["raw_dir"]

            alternate_raw_tsv = (
                "\t".join(EXPECTED_COLUMNS)
                + "\n"
                + "tt0000001\tshort\tCarmencita\tCarmencita\t0\t1894\t\\N\t1\tDocumentary,Short\n"
            )
            self.write_raw_artifact(raw_dir, alternate_raw_tsv)

            with self.assertRaisesRegex(
                ValueError,
                "Curated manifest source does not match the standalone raw manifest",
            ):
                collect_release_metadata(artifacts_dir)

    def test_resolve_repository_uses_dockerhub_username_by_default(self) -> None:
        with patch.dict(os.environ, {"DOCKERHUB_USERNAME": "gryphon2411"}, clear=True):
            self.assertEqual(
                resolve_repository(None),
                "gryphon2411/kino-mongo-seed",
            )

    def test_build_release_manifest_writes_expected_contract(self) -> None:
        metadata = {
            "datasetVersion": "imdb-title-basics-aaaaaaaaaaaa-t1",
            "transformVersion": "1",
            "rawSourceSha256": "a" * 64,
            "rawManifestSha256": "b" * 64,
            "curatedManifestSha256": "c" * 64,
            "seedManifestSha256": "d" * 64,
        }

        manifest = build_release_manifest(
            git_revision="deadbeef",
            metadata=metadata,
            mongo_seed_image_ref="gryphon2411/kino-mongo-seed@sha256:" + "e" * 64,
        )

        self.assertEqual(manifest["gitRevision"], "deadbeef")
        self.assertEqual(manifest["datasetVersion"], metadata["datasetVersion"])
        self.assertEqual(manifest["mongoSeedImageRef"], "gryphon2411/kino-mongo-seed@sha256:" + "e" * 64)

    def test_publish_mongo_seed_writes_local_release_manifest(self) -> None:
        metadata = {
            "datasetVersion": "imdb-title-basics-aaaaaaaaaaaa-t1",
            "transformVersion": "1",
            "rawSourceSha256": "a" * 64,
            "rawManifestSha256": "b" * 64,
            "curatedManifestSha256": "c" * 64,
            "seedManifestSha256": "d" * 64,
        }

        with tempfile.TemporaryDirectory() as temp_dir_name:
            jobs_dir = Path(temp_dir_name)
            artifacts_dir = jobs_dir / ".artifacts"
            dockerfile = jobs_dir / "images" / "mongo-seed" / "Dockerfile"
            dockerfile.parent.mkdir(parents=True, exist_ok=True)
            dockerfile.write_text("FROM scratch\n", encoding="utf-8")
            manifest_output_path = artifacts_dir / "release-manifest.json"

            with patch("imdb_titles_pipeline.release.publish.collect_release_metadata", return_value=metadata), \
                 patch("imdb_titles_pipeline.release.publish.login_to_docker_if_configured"), \
                 patch("imdb_titles_pipeline.release.publish.resolve_repo_digest", return_value="gryphon2411/kino-mongo-seed@sha256:" + "e" * 64), \
                 patch("imdb_titles_pipeline.release.publish.read_command_output", side_effect=["", "", "deadbeef"]):
                manifest = publish_mongo_seed(
                    jobs_dir=jobs_dir,
                    artifacts_dir=artifacts_dir,
                    dockerfile=dockerfile,
                    repository="gryphon2411/kino-mongo-seed",
                    manifest_output_path=manifest_output_path,
                )

            written_manifest = json.loads(manifest_output_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest, written_manifest)
            self.assertEqual(
                written_manifest["mongoSeedImageRef"],
                "gryphon2411/kino-mongo-seed@sha256:" + "e" * 64,
            )


if __name__ == "__main__":
    unittest.main()
