"""Mongo-backed serving projection helpers for the IMDb titles pipeline.

Keep package imports lazy so submodules such as ``validation`` can import
``mongo.definitions`` without triggering a restore/validation import cycle.
"""

from __future__ import annotations

from importlib import import_module
from typing import Any

__all__ = [
    "build_mongo_seed",
    "promote_restored_seed",
    "restore_mongo_seed",
    "wait_for_mongo_endpoint",
    "write_mongo_projection_ndjson",
]


def __getattr__(name: str) -> Any:
    if name in {"build_mongo_seed", "write_mongo_projection_ndjson"}:
        return getattr(import_module(".seed", __name__), name)
    if name in {"promote_restored_seed", "restore_mongo_seed", "wait_for_mongo_endpoint"}:
        return getattr(import_module(".restore", __name__), name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
