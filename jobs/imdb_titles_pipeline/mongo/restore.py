from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

from ..commons import MANIFEST_FILENAME, isoformat_utc, read_json, write_json
from ..validation import ArtifactValidator
from .definitions import (
    ACTIVE_METADATA_COLLECTION,
    ACTIVE_METADATA_DOCUMENT_ID,
    ACTIVE_TITLE_COLLECTION,
    BACKUP_TITLE_COLLECTION,
    DEFAULT_MONGO_WAIT_TIMEOUT_SECONDS,
    DEFAULT_RESTORE_WORKERS,
    MONGO_DATABASE_NAME,
    MONGO_SEED_ARCHIVE_NAME,
    RESTORE_HISTORY_COLLECTION,
    STAGING_TITLE_COLLECTION,
)
from .runtime import MongoToolsRuntime, build_mongo_uri

PROMOTION_SCRIPT_PATH = (
    Path(__file__).resolve().parents[2] / "images" / "mongo-seed" / "promote-mongo-seed.js"
)


class MongoSeedRestorer:
    def __init__(
        self,
        seed_dir: Path,
        *,
        workers: int | None = None,
        uri: str | None = None,
        docker_network: str | None = None,
        validator: ArtifactValidator | None = None,
        mongo_runtime: MongoToolsRuntime | None = None,
    ) -> None:
        self.seed_dir = seed_dir
        self.workers = workers
        self.uri = uri
        self.validator = validator or ArtifactValidator()
        self.mongo_runtime = mongo_runtime or MongoToolsRuntime(
            docker_network=docker_network,
        )

    def restore(self) -> None:
        archive_path = self.seed_dir / MONGO_SEED_ARCHIVE_NAME
        manifest_path = self.seed_dir / MANIFEST_FILENAME
        if not archive_path.exists():
            raise FileNotFoundError(f"Mongo seed archive not found: {archive_path}")
        if not manifest_path.exists():
            raise FileNotFoundError(f"Mongo seed manifest not found: {manifest_path}")

        restore_workers = self.workers or int(
            os.getenv("MONGO_RESTORE_WORKERS", str(DEFAULT_RESTORE_WORKERS))
        )
        mongo_uri = self.uri or build_mongo_uri()
        manifest = read_json(manifest_path)
        wait_timeout_env_name = "MONGO_WAIT_TIMEOUT_SECONDS"
        wait_timeout_default = str(DEFAULT_MONGO_WAIT_TIMEOUT_SECONDS)
        wait_timeout_seconds = int(os.getenv(wait_timeout_env_name, wait_timeout_default))

        self.validator.validate_seed_manifest(manifest, self.seed_dir)
        self.mongo_runtime.wait_for_endpoint(
            mongo_uri=mongo_uri,
            timeout_seconds=wait_timeout_seconds,
        )
        self.mongo_runtime.run_mongorestore(
            mongo_uri=mongo_uri,
            archive_path=archive_path,
            workers=restore_workers,
        )
        self.promote(manifest=manifest, mongo_uri=mongo_uri, manifest_path=manifest_path)

    def promote(
        self,
        *,
        manifest: dict[str, Any],
        mongo_uri: str,
        manifest_path: Path | None = None,
    ) -> None:
        if not PROMOTION_SCRIPT_PATH.exists():
            raise FileNotFoundError(f"Mongo promotion script not found: {PROMOTION_SCRIPT_PATH}")

        if manifest_path is not None:
            self._run_promotion_script(mongo_uri=mongo_uri, manifest_path=manifest_path)
            return

        with tempfile.TemporaryDirectory(prefix="kino-promotion-manifest-") as temp_dir_name:
            temp_manifest_path = Path(temp_dir_name) / MANIFEST_FILENAME
            write_json(temp_manifest_path, manifest)
            self._run_promotion_script(mongo_uri=mongo_uri, manifest_path=temp_manifest_path)

    def _build_promotion_environment(self, manifest_path: Path) -> dict[str, str]:
        return {
            "KINO_MANIFEST_PATH": str(manifest_path),
            "KINO_DATABASE_NAME": MONGO_DATABASE_NAME,
            "KINO_ACTIVE_COLLECTION": ACTIVE_TITLE_COLLECTION,
            "KINO_STAGING_COLLECTION": STAGING_TITLE_COLLECTION,
            "KINO_BACKUP_COLLECTION": BACKUP_TITLE_COLLECTION,
            "KINO_METADATA_COLLECTION": ACTIVE_METADATA_COLLECTION,
            "KINO_HISTORY_COLLECTION": RESTORE_HISTORY_COLLECTION,
            "KINO_METADATA_DOCUMENT_ID": ACTIVE_METADATA_DOCUMENT_ID,
            "KINO_PROMOTED_AT": isoformat_utc(timespec="milliseconds"),
            "MONGO_SEED_IMAGE_REF": os.getenv("MONGO_SEED_IMAGE_REF", ""),
        }

    def _run_promotion_script(self, *, mongo_uri: str, manifest_path: Path) -> None:
        self.mongo_runtime.run_mongosh_file(
            mongo_uri,
            script_path=PROMOTION_SCRIPT_PATH,
            script_env=self._build_promotion_environment(manifest_path.resolve()),
        )


def wait_for_mongo_endpoint(
    *,
    mongo_uri: str,
    docker_network: str | None = None,
    timeout_seconds: int = DEFAULT_MONGO_WAIT_TIMEOUT_SECONDS,
) -> None:
    MongoToolsRuntime(docker_network=docker_network).wait_for_endpoint(
        mongo_uri=mongo_uri,
        timeout_seconds=timeout_seconds,
    )


def promote_restored_seed(
    *,
    mongo_uri: str,
    manifest: dict[str, Any],
    docker_network: str | None = None,
) -> None:
    MongoSeedRestorer(
        seed_dir=Path("."),
        uri=mongo_uri,
        docker_network=docker_network,
    ).promote(manifest=manifest, mongo_uri=mongo_uri)


def restore_mongo_seed(
    seed_dir: Path,
    workers: int | None = None,
    uri: str | None = None,
    docker_network: str | None = None,
) -> None:
    MongoSeedRestorer(
        seed_dir,
        workers=workers,
        uri=uri,
        docker_network=docker_network,
        validator=ArtifactValidator(),
    ).restore()
