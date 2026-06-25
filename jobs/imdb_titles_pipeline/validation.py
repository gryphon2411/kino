from __future__ import annotations

from pathlib import Path
from typing import Any

from .commons import (
    CURATED_FILENAME,
    EXPECTED_COLUMNS,
    QUARANTINE_FILENAME,
    compute_sha256,
    derive_dataset_version,
    header_fingerprint,
)
from .mongo.definitions import MONGO_SEED_ARCHIVE_NAME


class ArtifactValidator:
    def validate_raw_manifest(
        self,
        raw_manifest: dict[str, Any],
        raw_archive_path: Path,
    ) -> tuple[str, str]:
        if not raw_manifest:
            raise ValueError("Raw manifest is required before building curated titles.")

        raw_artifact = raw_manifest.get("artifact", {})
        expected_sha256 = raw_artifact.get("sha256")
        if not expected_sha256:
            raise ValueError("Raw manifest is missing artifact.sha256.")

        actual_sha256 = compute_sha256(raw_archive_path)
        if actual_sha256 != expected_sha256:
            raise ValueError(
                f"Raw archive checksum mismatch for {raw_archive_path.name}: "
                f"expected {expected_sha256}, got {actual_sha256}"
            )

        expected_dataset_version = derive_dataset_version(actual_sha256)
        if raw_manifest.get("datasetVersion") != expected_dataset_version:
            raise ValueError(
                "Raw manifest datasetVersion does not match the validated archive checksum."
            )

        source = raw_manifest.get("source", {})
        expected_header = source.get("headerColumns")
        expected_fingerprint = source.get("headerFingerprint")
        if expected_header != list(EXPECTED_COLUMNS):
            raise ValueError("Raw manifest headerColumns does not match the expected IMDb schema.")
        if expected_fingerprint != header_fingerprint(EXPECTED_COLUMNS):
            raise ValueError("Raw manifest headerFingerprint does not match the expected IMDb schema.")

        return expected_dataset_version, actual_sha256

    def validate_artifact_checksum(
        self,
        *,
        manifest: dict[str, Any],
        artifact_name: str,
        artifact_path: Path,
        manifest_label: str,
    ) -> dict[str, Any]:
        artifact_manifest = manifest.get("artifacts", {}).get(artifact_name)
        if artifact_manifest is None:
            raise ValueError(f"{manifest_label} is missing artifacts.{artifact_name}.")
        if not artifact_path.exists():
            raise FileNotFoundError(f"{manifest_label} artifact not found: {artifact_path}")

        actual_sha256 = compute_sha256(artifact_path)
        if artifact_manifest.get("sha256") != actual_sha256:
            raise ValueError(
                f"{manifest_label} checksum mismatch for {artifact_name}: "
                f"expected {artifact_manifest.get('sha256')}, got {actual_sha256}"
            )
        return artifact_manifest

    def validate_curated_manifest(
        self,
        curated_manifest: dict[str, Any],
        curated_dir: Path,
    ) -> tuple[str, str]:
        source_manifest = curated_manifest.get("source")
        if not isinstance(source_manifest, dict):
            raise ValueError("Curated manifest is missing the nested raw source manifest.")

        raw_artifact = source_manifest.get("artifact", {})
        raw_sha256 = raw_artifact.get("sha256")
        if not raw_sha256:
            raise ValueError("Curated manifest source is missing artifact.sha256.")

        expected_dataset_version = derive_dataset_version(raw_sha256)
        if curated_manifest.get("datasetVersion") != expected_dataset_version:
            raise ValueError("Curated manifest datasetVersion does not match the source archive checksum.")
        if source_manifest.get("datasetVersion") != expected_dataset_version:
            raise ValueError("Nested raw manifest datasetVersion does not match the source archive checksum.")

        self.validate_artifact_checksum(
            manifest=curated_manifest,
            artifact_name=CURATED_FILENAME,
            artifact_path=curated_dir / CURATED_FILENAME,
            manifest_label="Curated manifest",
        )
        self.validate_artifact_checksum(
            manifest=curated_manifest,
            artifact_name=QUARANTINE_FILENAME,
            artifact_path=curated_dir / QUARANTINE_FILENAME,
            manifest_label="Curated manifest",
        )
        return expected_dataset_version, raw_sha256

    def validate_seed_manifest(self, seed_manifest: dict[str, Any], seed_dir: Path) -> str:
        source_manifest = seed_manifest.get("source")
        if not isinstance(source_manifest, dict):
            raise ValueError("Seed manifest is missing the nested curated source manifest.")

        source_raw_manifest = source_manifest.get("source")
        if not isinstance(source_raw_manifest, dict):
            raise ValueError("Seed manifest is missing the nested raw source manifest.")

        raw_sha256 = source_raw_manifest.get("artifact", {}).get("sha256")
        if not raw_sha256:
            raise ValueError("Seed manifest is missing the raw source artifact checksum.")

        expected_dataset_version = derive_dataset_version(raw_sha256)
        if seed_manifest.get("datasetVersion") != expected_dataset_version:
            raise ValueError("Seed manifest datasetVersion does not match the raw source checksum.")
        if source_manifest.get("datasetVersion") != expected_dataset_version:
            raise ValueError("Seed manifest nested curated datasetVersion does not match the raw source checksum.")
        if source_raw_manifest.get("datasetVersion") != expected_dataset_version:
            raise ValueError("Seed manifest nested raw datasetVersion does not match the raw source checksum.")
        if not source_manifest.get("qualityGate", {}).get("passed", False):
            raise ValueError("Seed manifest source curated artifact did not pass the quality gate.")

        self.validate_artifact_checksum(
            manifest=seed_manifest,
            artifact_name=MONGO_SEED_ARCHIVE_NAME,
            artifact_path=seed_dir / MONGO_SEED_ARCHIVE_NAME,
            manifest_label="Seed manifest",
        )
        return expected_dataset_version
