from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import requests

from .commons import (
    IMDB_SOURCE_URL,
    MANIFEST_FILENAME,
    RAW_ARCHIVE_NAME,
    RAW_SCHEMA_VERSION,
    derive_dataset_version,
    ensure_directory,
    header_fingerprint,
    isoformat_utc,
    logger,
    read_gzip_header_columns,
    utc_now,
    write_json,
)


class RawImdbSnapshotCapturer:
    def __init__(self, output_dir: Path, *, source_url: str = IMDB_SOURCE_URL) -> None:
        self.output_dir = output_dir
        self.source_url = source_url

    def capture(self) -> dict[str, Any]:
        ensure_directory(self.output_dir)
        archive_path = self.output_dir / RAW_ARCHIVE_NAME
        dataset_timestamp = utc_now()

        logger.info("Downloading %s into %s", self.source_url, self.output_dir.absolute())
        logger.info(
            """\
    Information courtesy of
    IMDb
    (https://www.imdb.com).
    Used with permission."""
        )

        sha256 = hashlib.sha256()
        with requests.get(self.source_url, stream=True, timeout=(30, 300)) as response:
            response.raise_for_status()
            last_modified = response.headers.get("Last-Modified")
            content_length = int(response.headers.get("Content-Length", "0"))
            with archive_path.open("wb") as archive_file:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if not chunk:
                        continue
                    archive_file.write(chunk)
                    sha256.update(chunk)

        raw_sha256 = sha256.hexdigest()
        header_columns = read_gzip_header_columns(archive_path)
        manifest = {
            "datasetVersion": derive_dataset_version(raw_sha256),
            "capturedAt": isoformat_utc(dataset_timestamp),
            "source": {
                "name": RAW_ARCHIVE_NAME,
                "url": self.source_url,
                "lastModified": last_modified,
                "contentLengthBytes": content_length,
                "schemaVersion": RAW_SCHEMA_VERSION,
                "headerColumns": header_columns,
                "headerFingerprint": header_fingerprint(header_columns),
            },
            "artifact": {
                "path": RAW_ARCHIVE_NAME,
                "bytes": archive_path.stat().st_size,
                "sha256": raw_sha256,
            },
        }
        write_json(self.output_dir / MANIFEST_FILENAME, manifest)
        logger.info("Captured raw IMDb snapshot (%s bytes)", archive_path.stat().st_size)
        return manifest


def capture_raw_imdb(output_dir: Path) -> dict[str, Any]:
    return RawImdbSnapshotCapturer(output_dir).capture()
