"""Kino data service client helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class KinoDataServiceClient:
    """Client for the Kino data service title endpoints."""

    base_url: str

    async def search_titles(
        self,
        free_text: str | None,
        genres: list[str] | None,
        title_type: str | None,
        is_adult: bool,
        size: int,
    ) -> list[dict[str, Any]]:
        """Search titles and return compact catalog records."""
        if not self.base_url:
            return [{"error": "KINO_DATA_SERVICE_URL is not configured."}]

        params = self._search_params(
            free_text=free_text,
            genres=genres,
            title_type=title_type,
            is_adult=is_adult,
            size=size,
        )

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.base_url}/titles", params=params
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            return [{"error": f"Failed to query Kino data service: {exc}"}]

        payload = response.json()
        content = payload.get(
            "content", payload if isinstance(payload, list) else []
        )
        return [
            TitleCompactor.compact(title)
            for title in content[: params["size"]]
        ]

    @staticmethod
    def _search_params(
        free_text: str | None,
        genres: list[str] | None,
        title_type: str | None,
        is_adult: bool,
        size: int,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "isAdult": str(is_adult).lower(),
            "page": 0,
            "size": min(max(size, 1), 12),
        }
        if free_text:
            params["freeText"] = free_text
        if genres:
            params["genres"] = genres
        if title_type:
            params["titleType"] = title_type
        return params


class TitleCompactor:
    """Convert data-service title payloads into compact tool results."""

    @classmethod
    def compact(cls, title: dict[str, Any]) -> dict[str, Any]:
        """Return the title fields the curator needs."""
        title_id = str(title.get("id") or title.get("titleConst") or "")
        title_name = (
            title.get("primaryTitle")
            or title.get("originalTitle")
            or "Untitled"
        )
        year = cls._to_int(title.get("startYear"))
        title_type = title.get("titleType")
        runtime_minutes = cls._to_int(title.get("runtimeMinutes"))
        genres = cls._genres(title)

        return {
            "id": title_id,
            "title": title_name,
            "year": year,
            "titleType": title_type,
            "runtimeMinutes": runtime_minutes,
            "genres": genres,
        }

    @staticmethod
    def _genres(title: dict[str, Any]) -> list[str]:
        genres = title.get("genres") or []
        if isinstance(genres, str):
            return [
                genre.strip() for genre in genres.split(",") if genre.strip()
            ]
        return genres

    @staticmethod
    def _to_int(value: Any) -> int | None:
        if value in (None, "", "\\N"):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
