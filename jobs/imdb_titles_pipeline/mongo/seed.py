from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from typing import Any, TextIO

import pyarrow.parquet as pq

from ..commons import (
    CURATED_FILENAME,
    DEFAULT_NDJSON_BATCH_SIZE,
    MANIFEST_FILENAME,
    SCHEMA_VERSION,
    TRANSFORM_VERSION,
    ensure_directory,
    file_metadata,
    isoformat_utc,
    logger,
    read_json,
    write_json,
)
from ..validation import ArtifactValidator
from .definitions import (
    ACTIVE_TITLE_COLLECTION,
    DEFAULT_MONGO_IMAGE,
    MONGO_DATABASE_NAME,
    MONGO_INDEX_DEFINITIONS,
    MONGO_SEED_ARCHIVE_NAME,
    PRIMARY_TITLE_SEARCH_KEY_FIELD,
)
from .runtime import TemporaryMongoContainer


class MongoSeedBuilder:
    def __init__(
        self,
        curated_dir: Path,
        output_dir: Path,
        *,
        mongo_image: str = DEFAULT_MONGO_IMAGE,
        validator: ArtifactValidator | None = None,
    ) -> None:
        self.curated_dir = curated_dir
        self.output_dir = output_dir
        self.mongo_image = mongo_image
        self.validator = validator or ArtifactValidator()

    def build(self) -> dict[str, Any]:
        ensure_directory(self.output_dir)
        curated_manifest = read_json(self.curated_dir / MANIFEST_FILENAME)
        dataset_version, _ = self.validator.validate_curated_manifest(
            curated_manifest,
            self.curated_dir,
        )
        curated_parquet_path = self.curated_dir / CURATED_FILENAME
        if not curated_manifest.get("qualityGate", {}).get("passed", False):
            raise ValueError("Curated manifest did not pass the quality gate; refusing to build Mongo seed.")

        logger.info("Building Mongo seed from %s", curated_parquet_path)
        with tempfile.TemporaryDirectory(prefix="kino-mongo-seed-") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            ndjson_path = temp_dir / f"{ACTIVE_TITLE_COLLECTION}.ndjson"
            archive_path = temp_dir / MONGO_SEED_ARCHIVE_NAME
            total_rows = self.write_mongo_projection_ndjson(
                curated_parquet_path,
                ndjson_path,
            )

            with TemporaryMongoContainer(temp_dir, mongo_image=self.mongo_image) as mongo:
                self._import_projection(mongo, ndjson_path)
                self._create_indexes(mongo)
                self._dump_seed_archive(mongo, archive_path)

            output_archive_path = self.output_dir / MONGO_SEED_ARCHIVE_NAME
            shutil.copy(archive_path, output_archive_path)

        manifest = {
            "datasetVersion": dataset_version,
            "schemaVersion": SCHEMA_VERSION,
            "transformVersion": TRANSFORM_VERSION,
            "createdAt": isoformat_utc(),
            "source": curated_manifest,
            "stats": {
                "documents": total_rows,
            },
            "mongo": {
                "image": self.mongo_image,
                "database": MONGO_DATABASE_NAME,
                "collection": ACTIVE_TITLE_COLLECTION,
                "idField": "_id",
                "tconstFieldRetained": True,
                "indexes": [
                    definition.to_manifest() for definition in MONGO_INDEX_DEFINITIONS
                ],
            },
            "artifacts": {
                MONGO_SEED_ARCHIVE_NAME: file_metadata(output_archive_path),
            },
        }
        write_json(self.output_dir / MANIFEST_FILENAME, manifest)
        logger.info("Built Mongo seed archive with %s documents", total_rows)
        return manifest

    def write_mongo_projection_ndjson(
        self,
        curated_parquet_path: Path,
        ndjson_path: Path,
        *,
        batch_size: int = DEFAULT_NDJSON_BATCH_SIZE,
    ) -> int:
        total_rows = 0
        parquet_file = pq.ParquetFile(curated_parquet_path)
        with ndjson_path.open("w", encoding="utf-8") as ndjson_file:
            for batch in parquet_file.iter_batches(batch_size=batch_size):
                records = batch.to_pylist()
                total_rows += self._write_projection_batch(records, ndjson_file)
        return total_rows

    def _write_projection_batch(
        self,
        records: list[dict[str, Any]],
        ndjson_file: TextIO,
    ) -> int:
        rows_written = 0
        for record in records:
            document = self._build_projection_document(record)
            ndjson_file.write(self._serialize_projection_document(document))
            rows_written += 1
        return rows_written

    def _build_projection_document(self, record: dict[str, Any]) -> dict[str, Any]:
        return {
            "_id": record["tconst"],
            PRIMARY_TITLE_SEARCH_KEY_FIELD: self._build_primary_title_search_key(record.get("primaryTitle")),
            **record,
        }

    @staticmethod
    def _build_primary_title_search_key(primary_title: Any) -> str | None:
        if not isinstance(primary_title, str):
            return None

        trimmed_title = primary_title.strip()
        if not trimmed_title:
            return None
        return trimmed_title.lower()

    @staticmethod
    def _serialize_projection_document(document: dict[str, Any]) -> str:
        return json.dumps(
            document,
            ensure_ascii=False,
            separators=(",", ":"),
        ) + "\n"

    def _import_projection(
        self,
        mongo: TemporaryMongoContainer,
        ndjson_path: Path,
    ) -> None:
        mongoimport_command = [
            "mongoimport",
            "--db",
            MONGO_DATABASE_NAME,
            "--collection",
            ACTIVE_TITLE_COLLECTION,
            "--type",
            "json",
            "--file",
            f"/work/{ndjson_path.name}",
        ]
        mongo.exec(*mongoimport_command)

    def _create_indexes(self, mongo: TemporaryMongoContainer) -> None:
        for definition in MONGO_INDEX_DEFINITIONS:
            mongosh_create_index_command = [
                "mongosh",
                MONGO_DATABASE_NAME,
                "--quiet",
                "--eval",
                definition.create_script,
            ]
            mongo.exec(*mongosh_create_index_command)

    def _dump_seed_archive(
        self,
        mongo: TemporaryMongoContainer,
        archive_path: Path,
    ) -> None:
        mongodump_command = [
            "mongodump",
            "--db",
            MONGO_DATABASE_NAME,
            "--collection",
            ACTIVE_TITLE_COLLECTION,
            f"--archive=/work/{archive_path.name}",
            "--gzip",
        ]
        mongo.exec(*mongodump_command)


def write_mongo_projection_ndjson(
    curated_parquet_path: Path,
    ndjson_path: Path,
    batch_size: int = DEFAULT_NDJSON_BATCH_SIZE,
) -> int:
    return MongoSeedBuilder(Path("."), Path(".")).write_mongo_projection_ndjson(
        curated_parquet_path,
        ndjson_path,
        batch_size=batch_size,
    )


def build_mongo_seed(
    curated_dir: Path,
    output_dir: Path,
    mongo_image: str = DEFAULT_MONGO_IMAGE,
) -> dict[str, Any]:
    return MongoSeedBuilder(
        curated_dir,
        output_dir,
        mongo_image=mongo_image,
        validator=ArtifactValidator(),
    ).build()
