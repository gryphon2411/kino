import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from imdb_titles_pipeline.release.publish import (  # noqa: E402
    build_release_manifest,
    collect_release_metadata,
    publish_mongo_seed,
    resolve_repository,
)


class PublishMongoSeedTests(unittest.TestCase):
    def test_collect_release_metadata_reads_expected_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            artifacts_dir = Path(temp_dir_name)
            raw_dir = artifacts_dir / "raw-imdb"
            curated_dir = artifacts_dir / "curated-titles"
            seed_dir = artifacts_dir / "mongo-seed"
            raw_dir.mkdir(parents=True)
            curated_dir.mkdir(parents=True)
            seed_dir.mkdir(parents=True)

            raw_manifest = {
                "datasetVersion": "imdb-title-basics-aaaaaaaaaaaa-t1",
                "artifact": {
                    "sha256": "a" * 64,
                },
            }
            curated_manifest = {
                "datasetVersion": "imdb-title-basics-aaaaaaaaaaaa-t1",
                "transformVersion": "1",
            }
            seed_manifest = {
                "datasetVersion": "imdb-title-basics-aaaaaaaaaaaa-t1",
                "transformVersion": "1",
                "source": {
                    "qualityGate": {
                        "passed": True,
                    },
                },
            }
            raw_manifest_path = raw_dir / "manifest.json"
            curated_manifest_path = curated_dir / "manifest.json"
            seed_manifest_path = seed_dir / "manifest.json"
            raw_manifest_path.write_text(json.dumps(raw_manifest), encoding="utf-8")
            curated_manifest_path.write_text(json.dumps(curated_manifest), encoding="utf-8")
            seed_manifest_path.write_text(json.dumps(seed_manifest), encoding="utf-8")

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
