from __future__ import annotations

import csv
import gzip
import json
from pathlib import Path
from typing import Any

from .commons import (
    CURATED_FILENAME,
    EXPECTED_COLUMNS,
    MANIFEST_FILENAME,
    NULLABLE_FIELDS,
    QUARANTINE_FILENAME,
    TCONST_RE,
    CuratedBuildState,
    CuratedTitleRecord,
    QualityGateResult,
    QualityGateThresholds,
    create_empty_parquet,
    ensure_directory,
    file_metadata,
    flush_curated_batch,
    isoformat_utc,
    logger,
    read_json,
    utc_now,
    write_json,
    DEFAULT_MAX_REJECTED_ROWS,
    DEFAULT_MAX_REJECTION_RATE,
    DEFAULT_PARQUET_BATCH_SIZE,
    RAW_ARCHIVE_NAME,
    SCHEMA_VERSION,
    TRANSFORM_VERSION,
)
from .validation import ArtifactValidator


class CuratedTitleRowParser:
    @staticmethod
    def normalize_text(value: str) -> str | None:
        if value == "\\N":
            return None
        return value

    @staticmethod
    def parse_numeric_field(value: str, field_name: str) -> tuple[int | None, str | None]:
        if value == "\\N":
            return None, None
        if value.isdigit():
            return int(value), None
        return None, f"invalid_{field_name}"

    @staticmethod
    def parse_is_adult(value: str) -> tuple[bool | None, str | None]:
        if value == "\\N":
            return None, None
        if value == "0":
            return False, None
        if value == "1":
            return True, None
        return None, "invalid_isAdult"

    @staticmethod
    def parse_genres(value: str) -> list[str] | None:
        if value == "\\N":
            return None
        return [genre.strip() for genre in value.split(",") if genre.strip()]

    def parse(self, raw_fields: list[str]) -> tuple[CuratedTitleRecord | None, str | None]:
        if len(raw_fields) != len(EXPECTED_COLUMNS):
            return None, "invalid_column_count"

        row = dict(zip(EXPECTED_COLUMNS, raw_fields))
        tconst = row["tconst"]
        if not TCONST_RE.match(tconst):
            return None, "invalid_tconst"

        is_adult, is_adult_error = self.parse_is_adult(row["isAdult"])
        if is_adult_error:
            return None, is_adult_error

        start_year, start_year_error = self.parse_numeric_field(row["startYear"], "startYear")
        if start_year_error:
            return None, start_year_error

        end_year, end_year_error = self.parse_numeric_field(row["endYear"], "endYear")
        if end_year_error:
            return None, end_year_error

        runtime_minutes, runtime_error = self.parse_numeric_field(
            row["runtimeMinutes"],
            "runtimeMinutes",
        )
        if runtime_error:
            return None, runtime_error

        return CuratedTitleRecord(
            tconst=tconst,
            title_type=self.normalize_text(row["titleType"]),
            primary_title=self.normalize_text(row["primaryTitle"]),
            original_title=self.normalize_text(row["originalTitle"]),
            is_adult=is_adult,
            start_year=start_year,
            end_year=end_year,
            runtime_minutes=runtime_minutes,
            genres=self.parse_genres(row["genres"]),
        ), None


class CuratedTitlesBuilder:
    def __init__(
        self,
        raw_dir: Path,
        output_dir: Path,
        *,
        batch_size: int = DEFAULT_PARQUET_BATCH_SIZE,
        thresholds: QualityGateThresholds | None = None,
        validator: ArtifactValidator | None = None,
        row_parser: CuratedTitleRowParser | None = None,
    ) -> None:
        self.raw_dir = raw_dir
        self.output_dir = output_dir
        self.batch_size = batch_size
        self.thresholds = thresholds or QualityGateThresholds()
        self.validator = validator or ArtifactValidator()
        self.row_parser = row_parser or CuratedTitleRowParser()
        self.state = CuratedBuildState()
        self.started_at = utc_now()

    def build(self) -> dict[str, Any]:
        ensure_directory(self.output_dir)
        raw_manifest_path = self.raw_dir / MANIFEST_FILENAME
        raw_archive_path = self.raw_dir / RAW_ARCHIVE_NAME
        parquet_path = self.output_dir / CURATED_FILENAME
        quarantine_path = self.output_dir / QUARANTINE_FILENAME

        if not raw_archive_path.exists():
            raise FileNotFoundError(f"Raw archive not found: {raw_archive_path}")
        if not raw_manifest_path.exists():
            raise FileNotFoundError(f"Raw manifest not found: {raw_manifest_path}")

        raw_manifest = read_json(raw_manifest_path)
        dataset_version, _ = self.validator.validate_raw_manifest(raw_manifest, raw_archive_path)

        logger.info("Building curated titles artifact from %s", raw_archive_path)
        try:
            with gzip.open(raw_archive_path, "rt", encoding="utf-8", newline="") as archive_file:
                reader = csv.reader(archive_file, delimiter="\t")
                header = next(reader, None)
                if header != list(EXPECTED_COLUMNS):
                    raise ValueError(f"Unexpected IMDb header: {header}")

                with gzip.open(quarantine_path, "wt", encoding="utf-8") as quarantine_file:
                    for row_number, raw_fields in enumerate(reader, start=2):
                        self._process_raw_row(
                            raw_fields=raw_fields,
                            row_number=row_number,
                            quarantine_file=quarantine_file,
                            parquet_path=parquet_path,
                        )

            self._finalize_parquet(parquet_path)
        finally:
            self._close_parquet_writer()

        quality_gate = QualityGateResult.from_counts(
            input_rows=self.state.input_rows,
            rejected_rows=self.state.rejected_rows,
            thresholds=self.thresholds,
        )
        manifest = self._build_manifest(
            dataset_version=dataset_version,
            raw_manifest=raw_manifest,
            parquet_path=parquet_path,
            quarantine_path=quarantine_path,
            quality_gate=quality_gate,
        )
        write_json(self.output_dir / MANIFEST_FILENAME, manifest)

        if not quality_gate.passed:
            raise ValueError(
                "Curated titles quality gate failed: "
                f"{quality_gate.actual_rejected_rows} rejected rows "
                f"({quality_gate.actual_rejection_rate:.6%}) exceeds thresholds."
            )

        logger.info(
            "Built curated titles artifact with %s accepted rows and %s rejected rows",
            self.state.accepted_rows,
            self.state.rejected_rows,
        )
        return manifest

    def _process_raw_row(
        self,
        *,
        raw_fields: list[str],
        row_number: int,
        quarantine_file: Any,
        parquet_path: Path,
    ) -> None:
        self.state.input_rows += 1
        record, rejection_reason = self.row_parser.parse(raw_fields)
        if rejection_reason:
            self._reject_row(
                quarantine_file=quarantine_file,
                row_number=row_number,
                reason=rejection_reason,
                raw_fields=raw_fields,
            )
            return

        if record is None:
            raise ValueError("Row parser returned neither a record nor a rejection reason.")

        duplicate_reason = self._check_tconst_order(record.tconst)
        if duplicate_reason:
            self._reject_row(
                quarantine_file=quarantine_file,
                row_number=row_number,
                reason=duplicate_reason,
                raw_fields=raw_fields,
            )
            return

        self._append_record(record)
        if len(self.state.batch_columns["tconst"]) >= self.batch_size:
            self.state.parquet_writer = flush_curated_batch(
                self.state.parquet_writer,
                parquet_path,
                self.state.batch_columns,
            )

    def _reject_row(
        self,
        *,
        quarantine_file: Any,
        row_number: int,
        reason: str,
        raw_fields: list[str],
    ) -> None:
        self.state.rejection_counts[reason] += 1
        quarantine_file.write(json.dumps({
            "rowNumber": row_number,
            "reason": reason,
            "rawFields": raw_fields,
        }) + "\n")

    def _check_tconst_order(self, current_tconst: str) -> str | None:
        if self.state.last_tconst is not None:
            if current_tconst < self.state.last_tconst:
                raise ValueError(
                    "IMDb title.basics.tsv.gz is no longer sorted by tconst; "
                    "duplicate detection assumptions are invalid."
                )
            if current_tconst == self.state.last_tconst:
                return "duplicate_tconst"
        self.state.last_tconst = current_tconst
        return None

    def _append_record(self, record: CuratedTitleRecord) -> None:
        parquet_row = record.to_parquet_row()
        for field_name, value in parquet_row.items():
            self.state.batch_columns[field_name].append(value)

        for field_name in NULLABLE_FIELDS:
            if parquet_row[field_name] is None:
                self.state.null_counts[field_name] += 1

        self.state.accepted_rows += 1

    def _finalize_parquet(self, parquet_path: Path) -> None:
        if self.state.accepted_rows == 0:
            create_empty_parquet(parquet_path)
            return

        if self.state.batch_columns["tconst"]:
            self.state.parquet_writer = flush_curated_batch(
                self.state.parquet_writer,
                parquet_path,
                self.state.batch_columns,
            )

    def _close_parquet_writer(self) -> None:
        if self.state.parquet_writer is not None:
            self.state.parquet_writer.close()
            self.state.parquet_writer = None

    def _build_manifest(
        self,
        *,
        dataset_version: str,
        raw_manifest: dict[str, Any],
        parquet_path: Path,
        quarantine_path: Path,
        quality_gate: QualityGateResult,
    ) -> dict[str, Any]:
        return {
            "datasetVersion": dataset_version,
            "schemaVersion": SCHEMA_VERSION,
            "transformVersion": TRANSFORM_VERSION,
            "createdAt": isoformat_utc(self.started_at),
            "source": raw_manifest,
            "stats": {
                "inputRows": self.state.input_rows,
                "acceptedRows": self.state.accepted_rows,
                "rejectedRows": self.state.rejected_rows,
                "nullCounts": {
                    field: self.state.null_counts.get(field, 0)
                    for field in NULLABLE_FIELDS
                },
                "rejectionCounts": dict(sorted(self.state.rejection_counts.items())),
            },
            "qualityGate": quality_gate.to_manifest_dict(),
            "artifacts": {
                CURATED_FILENAME: file_metadata(parquet_path),
                QUARANTINE_FILENAME: file_metadata(quarantine_path),
            },
        }


def normalize_text(value: str) -> str | None:
    return CuratedTitleRowParser.normalize_text(value)


def parse_numeric_field(value: str, field_name: str) -> tuple[int | None, str | None]:
    return CuratedTitleRowParser.parse_numeric_field(value, field_name)


def parse_is_adult(value: str) -> tuple[bool | None, str | None]:
    return CuratedTitleRowParser.parse_is_adult(value)


def parse_genres(value: str) -> list[str] | None:
    return CuratedTitleRowParser.parse_genres(value)


def parse_curated_record(raw_fields: list[str]) -> tuple[dict[str, Any] | None, str | None]:
    record, reason = CuratedTitleRowParser().parse(raw_fields)
    if record is None:
        return None, reason
    return record.to_parquet_row(), reason


def evaluate_quality_gate(
    *,
    input_rows: int,
    rejected_rows: int,
    max_rejected_rows: int,
    max_rejection_rate: float,
) -> dict[str, Any]:
    return QualityGateResult.from_counts(
        input_rows=input_rows,
        rejected_rows=rejected_rows,
        thresholds=QualityGateThresholds(
            max_rejected_rows=max_rejected_rows,
            max_rejection_rate=max_rejection_rate,
        ),
    ).to_manifest_dict()


def build_curated_titles(
    raw_dir: Path,
    output_dir: Path,
    batch_size: int = DEFAULT_PARQUET_BATCH_SIZE,
    max_rejected_rows: int = DEFAULT_MAX_REJECTED_ROWS,
    max_rejection_rate: float = DEFAULT_MAX_REJECTION_RATE,
) -> dict[str, Any]:
    return CuratedTitlesBuilder(
        raw_dir,
        output_dir,
        batch_size=batch_size,
        thresholds=QualityGateThresholds(
            max_rejected_rows=max_rejected_rows,
            max_rejection_rate=max_rejection_rate,
        ),
        validator=ArtifactValidator(),
        row_parser=CuratedTitleRowParser(),
    ).build()
