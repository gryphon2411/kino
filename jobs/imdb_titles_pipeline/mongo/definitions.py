from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

MONGO_SEED_ARCHIVE_NAME = "seed.archive.gz"
DEFAULT_RESTORE_WORKERS = 4
DEFAULT_MONGO_WAIT_TIMEOUT_SECONDS = 300
DEFAULT_MONGO_READY_TIMEOUT_SECONDS = 30
DEFAULT_MONGO_IMAGE = "mongo:8.0"
ACTIVE_METADATA_DOCUMENT_ID = "active"
ACTIVE_METADATA_COLLECTION = "title_dataset_metadata"
RESTORE_HISTORY_COLLECTION = "title_dataset_restore_history"
MONGO_DATABASE_NAME = "kino"
ACTIVE_TITLE_COLLECTION = "title_basics"
STAGING_TITLE_COLLECTION = "title_basics_staging"
BACKUP_TITLE_COLLECTION = "title_basics_backup"
# Derived helper field stored in Mongo for indexed case-insensitive prefix search
# on primary titles. We materialize a trimmed/lowercased search key so the data
# service can query `^prefix` against this indexed field instead of running a
# case-insensitive regex over the user-facing `primaryTitle` field.
PRIMARY_TITLE_SEARCH_KEY_FIELD = "primaryTitleSearchKey"


@dataclass(frozen=True)
class MongoIndexDefinition:
    name: str
    create_script: str
    manifest: dict[str, Any]

    def to_manifest(self) -> dict[str, Any]:
        return copy.deepcopy(self.manifest)


MONGO_INDEX_DEFINITIONS = (
    MongoIndexDefinition(
        name="title_text_index",
        create_script=(
            r"db.title_basics.createIndex("
            r"{primaryTitle:'text',originalTitle:'text'},"
            r"{name:'title_text_index',weights:{primaryTitle:2,originalTitle:1}})"
        ),
        manifest={
            "name": "title_text_index",
            "type": "text",
            "weights": {"primaryTitle": 2, "originalTitle": 1},
        },
    ),
    MongoIndexDefinition(
        name="title_filter_index",
        create_script=(
            r"db.title_basics.createIndex("
            r"{titleType:1,isAdult:1,startYear:1},"
            r"{name:'title_filter_index'})"
        ),
        manifest={
            "name": "title_filter_index",
            "keys": {"titleType": 1, "isAdult": 1, "startYear": 1},
        },
    ),
    MongoIndexDefinition(
        name="title_genres_index",
        create_script=(
            r"db.title_basics.createIndex("
            r"{genres:1},"
            r"{name:'title_genres_index'})"
        ),
        manifest={
            "name": "title_genres_index",
            "keys": {"genres": 1},
        },
    ),
    MongoIndexDefinition(
        name="title_primary_title_search_key_index",
        create_script=(
            r"db.title_basics.createIndex("
            r"{primaryTitleSearchKey:1},"
            r"{name:'title_primary_title_search_key_index'})"
        ),
        manifest={
            "name": "title_primary_title_search_key_index",
            "keys": {PRIMARY_TITLE_SEARCH_KEY_FIELD: 1},
        },
    ),
)
