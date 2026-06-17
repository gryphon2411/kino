import gzip
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path

import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from imdb_titles_pipeline.curation import build_curated_titles  # noqa: E402
from imdb_titles_pipeline.commons import (  # noqa: E402
    CURATED_FILENAME,
    MANIFEST_FILENAME,
    QUARANTINE_FILENAME,
    RAW_ARCHIVE_NAME,
    derive_dataset_version,
    header_fingerprint,
)
from imdb_titles_pipeline.mongo.definitions import MONGO_SEED_ARCHIVE_NAME  # noqa: E402
from imdb_titles_pipeline.mongo.restore import restore_mongo_seed  # noqa: E402
from imdb_titles_pipeline.mongo.seed import build_mongo_seed  # noqa: E402


SAMPLE_TSV = "\n".join([
    "\t".join([
        "tconst", "titleType", "primaryTitle", "originalTitle", "isAdult",
        "startYear", "endYear", "runtimeMinutes", "genres",
    ]),
    "\t".join([
        "tt0000001", "short", "Carmencita", "Carmencita", "0",
        "1894", "\\N", "1", "Documentary,Short",
    ]),
    "\t".join([
        "tt0000002", "short", "Le clown et ses chiens", "Le clown et ses chiens", "\\N",
        "1892", "\\N", "5", "\\N",
    ]),
    "\t".join([
        "tt0000003", "movie", "Broken Row", "Broken Row", "2019", "45", "\\N", "\\N", "Talk-Show",
    ]),
]) + "\n"


def write_raw_artifact(raw_dir: Path, dataset_version: str | None = None) -> None:
    raw_dir.mkdir(parents=True, exist_ok=True)
    archive_path = raw_dir / RAW_ARCHIVE_NAME
    with gzip.open(archive_path, "wt", encoding="utf-8") as archive_file:
        archive_file.write(SAMPLE_TSV)
    raw_sha256 = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    resolved_dataset_version = dataset_version or derive_dataset_version(raw_sha256)

    manifest = {
        "datasetVersion": resolved_dataset_version,
        "capturedAt": "2026-05-20T00:00:00Z",
        "source": {
            "name": RAW_ARCHIVE_NAME,
            "url": f"https://datasets.imdbws.com/{RAW_ARCHIVE_NAME}",
            "lastModified": "Mon, 18 May 2026 00:27:18 GMT",
            "contentLengthBytes": archive_path.stat().st_size,
            "schemaVersion": "1",
            "headerColumns": [
                "tconst", "titleType", "primaryTitle", "originalTitle", "isAdult",
                "startYear", "endYear", "runtimeMinutes", "genres",
            ],
            "headerFingerprint": header_fingerprint((
                "tconst", "titleType", "primaryTitle", "originalTitle", "isAdult",
                "startYear", "endYear", "runtimeMinutes", "genres",
            )),
        },
        "artifact": {
            "path": RAW_ARCHIVE_NAME,
            "bytes": archive_path.stat().st_size,
            "sha256": raw_sha256,
        },
    }
    (raw_dir / MANIFEST_FILENAME).write_text(json.dumps(manifest), encoding="utf-8")


class CuratedTitlesTests(unittest.TestCase):
    def test_build_curated_titles_preserves_nulls_and_quarantines_bad_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            raw_dir = temp_dir / "raw"
            curated_dir = temp_dir / "curated"
            write_raw_artifact(raw_dir)

            build_curated_titles(
                raw_dir,
                curated_dir,
                max_rejected_rows=1,
                max_rejection_rate=1.0,
            )

            manifest = json.loads((curated_dir / MANIFEST_FILENAME).read_text(encoding="utf-8"))
            rows = pq.read_table(curated_dir / CURATED_FILENAME).to_pylist()
            quarantine_lines = gzip.open(
                curated_dir / QUARANTINE_FILENAME, "rt", encoding="utf-8"
            ).read().strip().splitlines()

            self.assertEqual(manifest["stats"]["inputRows"], 3)
            self.assertEqual(manifest["stats"]["acceptedRows"], 2)
            self.assertEqual(manifest["stats"]["rejectedRows"], 1)
            self.assertEqual(manifest["stats"]["rejectionCounts"]["invalid_isAdult"], 1)
            self.assertTrue(manifest["qualityGate"]["passed"])
            self.assertEqual(len(rows), 2)
            self.assertEqual(len(quarantine_lines), 1)
            self.assertEqual(rows[0]["tconst"], "tt0000001")
            self.assertIsNone(rows[0]["endYear"])
            self.assertEqual(rows[0]["genres"], ["Documentary", "Short"])
            self.assertEqual(rows[1]["tconst"], "tt0000002")
            self.assertIsNone(rows[1]["isAdult"])
            self.assertIsNone(rows[1]["endYear"])
            self.assertIsNone(rows[1]["genres"])

    def test_build_curated_titles_requires_raw_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            raw_dir = temp_dir / "raw"
            curated_dir = temp_dir / "curated"
            raw_dir.mkdir(parents=True, exist_ok=True)
            with gzip.open(raw_dir / RAW_ARCHIVE_NAME, "wt", encoding="utf-8") as archive_file:
                archive_file.write(SAMPLE_TSV)

            with self.assertRaisesRegex(FileNotFoundError, "Raw manifest not found"):
                build_curated_titles(raw_dir, curated_dir)

    def test_build_curated_titles_enforces_quality_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            raw_dir = temp_dir / "raw"
            curated_dir = temp_dir / "curated"
            write_raw_artifact(raw_dir)

            with self.assertRaisesRegex(ValueError, "quality gate failed"):
                build_curated_titles(raw_dir, curated_dir, max_rejected_rows=0, max_rejection_rate=0.0)

    def test_build_curated_titles_rejects_raw_manifest_dataset_version_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            raw_dir = temp_dir / "raw"
            curated_dir = temp_dir / "curated"
            write_raw_artifact(raw_dir, dataset_version="imdb-title-basics-tampered")

            with self.assertRaisesRegex(ValueError, "datasetVersion does not match"):
                build_curated_titles(raw_dir, curated_dir)

    def test_build_curated_titles_rejects_duplicate_tconst(self) -> None:
        duplicate_tsv = "\n".join([
            "\t".join([
                "tconst", "titleType", "primaryTitle", "originalTitle", "isAdult",
                "startYear", "endYear", "runtimeMinutes", "genres",
            ]),
            "\t".join([
                "tt0000001", "short", "Carmencita", "Carmencita", "0",
                "1894", "\\N", "1", "Documentary,Short",
            ]),
            "\t".join([
                "tt0000001", "short", "Carmencita Again", "Carmencita Again", "0",
                "1894", "\\N", "1", "Documentary,Short",
            ]),
        ]) + "\n"

        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            raw_dir = temp_dir / "raw"
            curated_dir = temp_dir / "curated"
            raw_dir.mkdir(parents=True, exist_ok=True)
            archive_path = raw_dir / RAW_ARCHIVE_NAME
            with gzip.open(archive_path, "wt", encoding="utf-8") as archive_file:
                archive_file.write(duplicate_tsv)
            raw_sha256 = hashlib.sha256(archive_path.read_bytes()).hexdigest()
            manifest = {
                "datasetVersion": derive_dataset_version(raw_sha256),
                "capturedAt": "2026-05-20T00:00:00Z",
                "source": {
                    "name": RAW_ARCHIVE_NAME,
                    "url": f"https://datasets.imdbws.com/{RAW_ARCHIVE_NAME}",
                    "lastModified": "Mon, 18 May 2026 00:27:18 GMT",
                    "contentLengthBytes": archive_path.stat().st_size,
                    "schemaVersion": "1",
                    "headerColumns": [
                        "tconst", "titleType", "primaryTitle", "originalTitle", "isAdult",
                        "startYear", "endYear", "runtimeMinutes", "genres",
                    ],
                    "headerFingerprint": header_fingerprint((
                        "tconst", "titleType", "primaryTitle", "originalTitle", "isAdult",
                        "startYear", "endYear", "runtimeMinutes", "genres",
                    )),
                },
                "artifact": {
                    "path": RAW_ARCHIVE_NAME,
                    "bytes": archive_path.stat().st_size,
                    "sha256": raw_sha256,
                },
            }
            (raw_dir / MANIFEST_FILENAME).write_text(json.dumps(manifest), encoding="utf-8")

            build_curated_titles(
                raw_dir,
                curated_dir,
                max_rejected_rows=1,
                max_rejection_rate=1.0,
            )

            curated_manifest = json.loads((curated_dir / MANIFEST_FILENAME).read_text(encoding="utf-8"))
            self.assertEqual(curated_manifest["stats"]["rejectionCounts"]["duplicate_tconst"], 1)

    def test_build_mongo_seed_rejects_curated_checksum_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            raw_dir = temp_dir / "raw"
            curated_dir = temp_dir / "curated"
            seed_dir = temp_dir / "seed"
            write_raw_artifact(raw_dir)
            build_curated_titles(
                raw_dir,
                curated_dir,
                max_rejected_rows=1,
                max_rejection_rate=1.0,
            )

            manifest_path = curated_dir / MANIFEST_FILENAME
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["artifacts"][CURATED_FILENAME]["sha256"] = "0" * 64
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "Curated manifest checksum mismatch"):
                build_mongo_seed(curated_dir, seed_dir)


@unittest.skipUnless(shutil.which("docker"), "docker is required for the Mongo seed integration test")
class MongoSeedIntegrationTests(unittest.TestCase):
    def wait_for_mongo(self, container_name: str, timeout_seconds: int = 30) -> None:
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            result = subprocess.run(
                [
                    "docker", "exec", container_name,
                    "mongosh", "--quiet", "--eval", "db.adminCommand({ping: 1}).ok",
                ],
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            if result.returncode == 0 and result.stdout.strip() == "1":
                return
            time.sleep(1)
        self.fail(f"Timed out waiting for Mongo container {container_name}")

    def test_build_mongo_seed_and_restore_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            raw_dir = temp_dir / "raw"
            curated_dir = temp_dir / "curated"
            seed_dir = temp_dir / "seed"
            write_raw_artifact(raw_dir)
            build_curated_titles(
                raw_dir,
                curated_dir,
                max_rejected_rows=1,
                max_rejection_rate=1.0,
            )
            build_mongo_seed(curated_dir, seed_dir)

            self.assertTrue((seed_dir / MONGO_SEED_ARCHIVE_NAME).exists())
            self.assertTrue((seed_dir / MANIFEST_FILENAME).exists())

            network_name = f"kino-restore-net-{uuid.uuid4().hex[:8]}"
            container_name = f"kino-restore-test-{uuid.uuid4().hex[:8]}"
            try:
                subprocess.run(
                    ["docker", "network", "create", network_name],
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                subprocess.run(
                    [
                        "docker", "run", "-d", "--rm",
                        "--network", network_name,
                        "--name", container_name,
                        "mongo:8.0", "--bind_ip_all",
                    ],
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                self.wait_for_mongo(container_name)

                restore_mongo_seed(
                    seed_dir,
                    workers=2,
                    uri=f"mongodb://{container_name}:27017/",
                    docker_network=network_name,
                )
                restore_mongo_seed(
                    seed_dir,
                    workers=2,
                    uri=f"mongodb://{container_name}:27017/",
                    docker_network=network_name,
                )

                count = subprocess.check_output(
                    [
                        "docker", "exec", container_name,
                        "mongosh", "kino", "--quiet",
                        "--eval", "db.title_basics.countDocuments()",
                    ],
                    text=True,
                ).strip()
                tconst = subprocess.check_output(
                    [
                        "docker", "exec", container_name,
                        "mongosh", "kino", "--quiet",
                        "--eval", "db.title_basics.findOne({_id: 'tt0000001'}).tconst",
                    ],
                    text=True,
                ).strip()
                indexes = subprocess.check_output(
                    [
                        "docker", "exec", container_name,
                        "mongosh", "kino", "--quiet",
                        "--eval", "db.title_basics.getIndexes().map(index => index.name).join(',')",
                    ],
                    text=True,
                ).strip().split(",")
                metadata_dataset_version = subprocess.check_output(
                    [
                        "docker", "exec", container_name,
                        "mongosh", "kino", "--quiet",
                        "--eval", "db.title_dataset_metadata.findOne({_id: 'active'}).datasetVersion",
                    ],
                    text=True,
                ).strip()

                self.assertEqual(count, "2")
                self.assertEqual(tconst, "tt0000001")
                self.assertIn("title_text_index", indexes)
                self.assertIn("title_filter_index", indexes)
                self.assertIn("title_genres_index", indexes)
                self.assertEqual(metadata_dataset_version, json.loads(
                    (seed_dir / MANIFEST_FILENAME).read_text(encoding="utf-8")
                )["datasetVersion"])
            finally:
                subprocess.run(
                    ["docker", "stop", container_name],
                    check=False,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                subprocess.run(
                    ["docker", "network", "rm", network_name],
                    check=False,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
