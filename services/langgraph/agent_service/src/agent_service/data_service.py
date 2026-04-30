"""Kino data service client helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class MachineAccessTokenClient:
    """Client for Kino auth service client-credentials tokens."""

    base_url: str
    client_id: str
    client_secret: str

    async def issue_token(self) -> str:
        """Request a short-lived bearer token for internal API access."""
        if not self.base_url or not self.client_id or not self.client_secret:
            raise ValueError(
                "KINO_AUTH_SERVICE_URL, KINO_AUTH_CLIENT_ID, and "
                "KINO_AUTH_CLIENT_SECRET must be configured."
            )

        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"{self.base_url}/oauth2/token",
                auth=(self.client_id, self.client_secret),
                data={"grant_type": "client_credentials"},
            )
            response.raise_for_status()

        payload = response.json()
        access_token = payload.get("access_token")
        if not access_token:
            raise ValueError(
                "Kino auth service did not return an access token."
            )
        return str(access_token)


@dataclass(frozen=True)
class KinoDataServiceClient:
    """Client for the Kino data service title endpoints."""

    base_url: str
    auth_service_url: str
    auth_client_id: str
    auth_client_secret: str

    async def search_titles(
        self,
        free_text: str | None,
        genres: list[str] | None,
        title_type: str | None,
        start_year_gte: int | None,
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
            start_year_gte=start_year_gte,
            is_adult=is_adult,
            size=size,
        )

        try:
            headers = await self._authorization_header()
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.base_url}/internal/titles/search",
                    params=params,
                    headers=headers,
                )
                response.raise_for_status()
        except ValueError as exc:
            return [
                {
                    "error": (
                        "Failed to authenticate against Kino auth service: "
                        f"{exc}"
                    )
                }
            ]
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
        start_year_gte: int | None,
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
        if start_year_gte is not None:
            params["startYearGte"] = start_year_gte
        return params

    async def _authorization_header(self) -> dict[str, str]:
        token_client = MachineAccessTokenClient(
            base_url=self.auth_service_url,
            client_id=self.auth_client_id,
            client_secret=self.auth_client_secret,
        )
        access_token = await token_client.issue_token()
        return {"Authorization": f"Bearer {access_token}"}


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
