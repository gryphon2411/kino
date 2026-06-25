from __future__ import annotations

import csv
import gzip
import hashlib
import json
import os
import re
import subprocess
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq

from log import get_logger

logger = get_logger("imdb_titles_pipeline")

RAW_ARCHIVE_NAME = "title.basics.tsv.gz"
CURATED_FILENAME = "titles.parquet"
MANIFEST_FILENAME = "manifest.json"
QUARANTINE_FILENAME = "quarantine.ndjson.gz"
TRANSFORM_VERSION = "1"
SCHEMA_VERSION = "1"
RAW_SCHEMA_VERSION = "1"
EXPECTED_COLUMNS = (
    "tconst",
    "titleType",
    "primaryTitle",
    "originalTitle",
    "isAdult",
    "startYear",
    "endYear",
    "runtimeMinutes",
    "genres",
)
NULLABLE_FIELDS = ("isAdult", "startYear", "endYear", "runtimeMinutes", "genres")
TCONST_RE = re.compile(r"^tt\d+$")
IMDB_SOURCE_URL = f"https://datasets.imdbws.com/{RAW_ARCHIVE_NAME}"
DEFAULT_PARQUET_BATCH_SIZE = 50_000
DEFAULT_NDJSON_BATCH_SIZE = 10_000
DEFAULT_MAX_REJECTED_ROWS = 1_000
DEFAULT_MAX_REJECTION_RATE = 0.0001
DEFAULT_COMMAND_TIMEOUT_SECONDS = 1_800
MONGO_URI_CREDENTIALS_RE = re.compile(r"(mongodb(?:\+srv)?://)([^@/]+)@")
CURATED_SCHEMA = pa.schema([
    pa.field("tconst", pa.string(), nullable=False),
    pa.field("titleType", pa.string(), nullable=True),
    pa.field("primaryTitle", pa.string(), nullable=True),
    pa.field("originalTitle", pa.string(), nullable=True),
    pa.field("isAdult", pa.bool_(), nullable=True),
    pa.field("startYear", pa.int64(), nullable=True),
    pa.field("endYear", pa.int64(), nullable=True),
    pa.field("runtimeMinutes", pa.int64(), nullable=True),
    pa.field("genres", pa.list_(pa.string()), nullable=True),
])


@dataclass(frozen=True)
class QualityGateThresholds:
    max_rejected_rows: int = DEFAULT_MAX_REJECTED_ROWS
    max_rejection_rate: float = DEFAULT_MAX_REJECTION_RATE


@dataclass(frozen=True)
class QualityGateResult:
    passed: bool
    max_rejected_rows: int
    max_rejection_rate: float
    actual_rejected_rows: int
    actual_rejection_rate: float

    @classmethod
    def from_counts(
        cls,
        *,
        input_rows: int,
        rejected_rows: int,
        thresholds: QualityGateThresholds,
    ) -> "QualityGateResult":
        rejection_rate = rejected_rows / input_rows if input_rows else 0.0
        return cls(
            passed=(
                rejected_rows <= thresholds.max_rejected_rows
                and rejection_rate <= thresholds.max_rejection_rate
            ),
            max_rejected_rows=thresholds.max_rejected_rows,
            max_rejection_rate=thresholds.max_rejection_rate,
            actual_rejected_rows=rejected_rows,
            actual_rejection_rate=rejection_rate,
        )

    def to_manifest_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "maxRejectedRows": self.max_rejected_rows,
            "maxRejectionRate": self.max_rejection_rate,
            "actualRejectedRows": self.actual_rejected_rows,
            "actualRejectionRate": self.actual_rejection_rate,
        }


@dataclass(frozen=True)
class CuratedTitleRecord:
    tconst: str
    title_type: str | None
    primary_title: str | None
    original_title: str | None
    is_adult: bool | None
    start_year: int | None
    end_year: int | None
    runtime_minutes: int | None
    genres: list[str] | None

    def to_parquet_row(self) -> dict[str, Any]:
        return {
            "tconst": self.tconst,
            "titleType": self.title_type,
            "primaryTitle": self.primary_title,
            "originalTitle": self.original_title,
            "isAdult": self.is_adult,
            "startYear": self.start_year,
            "endYear": self.end_year,
            "runtimeMinutes": self.runtime_minutes,
            "genres": self.genres,
        }


@dataclass
class CuratedBuildState:
    batch_columns: dict[str, list[Any]] = field(default_factory=lambda: empty_curated_batch())
    null_counts: Counter[str] = field(default_factory=Counter)
    rejection_counts: Counter[str] = field(default_factory=Counter)
    parquet_writer: pq.ParquetWriter | None = None
    input_rows: int = 0
    accepted_rows: int = 0
    last_tconst: str | None = None

    @property
    def rejected_rows(self) -> int:
        return self.input_rows - self.accepted_rows

def ensure_directory(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def isoformat_utc(moment: datetime | None = None, *, timespec: str = "seconds") -> str:
    value = moment or utc_now()
    return value.isoformat(timespec=timespec).replace("+00:00", "Z")


def derive_dataset_version(raw_sha256: str) -> str:
    return f"imdb-title-basics-{raw_sha256[:12]}-t{TRANSFORM_VERSION}"


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def compute_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_metadata(path: Path) -> dict[str, Any]:
    return {
        "path": path.name,
        "bytes": path.stat().st_size,
        "sha256": compute_sha256(path),
    }


def header_fingerprint(columns: tuple[str, ...] | list[str]) -> str:
    return hashlib.sha256("\t".join(columns).encode("utf-8")).hexdigest()


def read_gzip_header_columns(archive_path: Path) -> list[str]:
    with gzip.open(archive_path, "rt", encoding="utf-8", newline="") as archive_file:
        reader = csv.reader(archive_file, delimiter="\t")
        header = next(reader, None)
    if header is None:
        raise ValueError(f"IMDb archive {archive_path.name} is empty.")
    return header


def empty_curated_batch() -> dict[str, list[Any]]:
    return {field.name: [] for field in CURATED_SCHEMA}


def run_command(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
    sanitized_command = [MONGO_URI_CREDENTIALS_RE.sub(r"\1***@", arg) for arg in command]
    logger.info("Running command: %s", " ".join(sanitized_command))
    timeout_env_name = "TITLE_PIPELINE_COMMAND_TIMEOUT_SECONDS"
    timeout_default = str(DEFAULT_COMMAND_TIMEOUT_SECONDS)
    resolved_timeout = int(os.getenv(timeout_env_name, timeout_default))
    kwargs.setdefault("timeout", resolved_timeout)
    try:
        return subprocess.run(
            command,
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            **kwargs,
        )
    except subprocess.TimeoutExpired as exc:
        logger.error("Command timed out after %s seconds", exc.timeout)
        raise
    except subprocess.CalledProcessError as exc:
        logger.error("Command failed with stdout=%s stderr=%s", exc.stdout, exc.stderr)
        raise


def flush_curated_batch(
    parquet_writer: pq.ParquetWriter | None,
    parquet_path: Path,
    batch_columns: dict[str, list[Any]],
) -> pq.ParquetWriter:
    table = pa.Table.from_pydict(batch_columns, schema=CURATED_SCHEMA)
    if parquet_writer is None:
        parquet_writer = pq.ParquetWriter(parquet_path, CURATED_SCHEMA, compression="gzip")
    parquet_writer.write_table(table)
    for values in batch_columns.values():
        values.clear()
    return parquet_writer


def create_empty_parquet(path: Path) -> None:
    empty_table = pa.Table.from_pydict(empty_curated_batch(), schema=CURATED_SCHEMA)
    pq.write_table(empty_table, path, compression="gzip")
