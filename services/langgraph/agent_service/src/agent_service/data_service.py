"""Kino data service client helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

MAX_EXCLUSION_SEARCH_PAGES = 5


@dataclass(frozen=True)
class TitleSearchRequest:
    """Normalized input for a single title search."""

    free_text: str | None
    genres: list[str] | None
    title_type: str | None
    min_year: int | None
    max_year: int | None
    exclude_ids: list[str] | None
    is_adult: bool
    size: int

    @property
    def requested_size(self) -> int:
        """Return the bounded page size for this search."""
        return min(max(self.size, 1), 12)

    @property
    def excluded_ids(self) -> set[str]:
        """Return normalized IDs that should be excluded."""
        return {
            str(title_id)
            for title_id in (self.exclude_ids or [])
            if title_id not in (None, "")
        }


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
        self, search: TitleSearchRequest
    ) -> list[dict[str, Any]]:
        """Search titles and return compact catalog records."""
        if not self.base_url:
            return [{"error": "KINO_DATA_SERVICE_URL is not configured."}]

        try:
            headers = await self._authorization_header()
            async with httpx.AsyncClient(timeout=5.0) as client:
                if not search.excluded_ids:
                    return await self._search_first_page(
                        client, headers=headers, search=search
                    )
                return await self._search_titles_with_exclusions(
                    client, headers=headers, search=search
                )
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

    @staticmethod
    def _search_params(
        search: TitleSearchRequest, page: int, size: int
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "isAdult": str(search.is_adult).lower(),
            "page": max(page, 0),
            "size": min(max(size, 1), 12),
        }
        if search.free_text:
            params["freeText"] = search.free_text
        if search.genres:
            params["genres"] = search.genres
        if search.title_type:
            params["titleType"] = search.title_type
        if search.min_year is not None:
            params["minYear"] = search.min_year
        if search.max_year is not None:
            params["maxYear"] = search.max_year
        return params

    async def _authorization_header(self) -> dict[str, str]:
        token_client = MachineAccessTokenClient(
            base_url=self.auth_service_url,
            client_id=self.auth_client_id,
            client_secret=self.auth_client_secret,
        )
        access_token = await token_client.issue_token()
        return {"Authorization": f"Bearer {access_token}"}

    async def _fetch_titles_page(
        self,
        client: httpx.AsyncClient,
        *,
        headers: dict[str, str],
        search: TitleSearchRequest,
        page: int,
        size: int,
    ) -> tuple[list[dict[str, Any]], bool]:
        params = self._search_params(search=search, page=page, size=size)
        response = await client.get(
            f"{self.base_url}/internal/titles/search",
            params=params,
            headers=headers,
        )
        response.raise_for_status()
        payload = response.json()
        content = payload.get(
            "content", payload if isinstance(payload, list) else []
        )
        titles = [
            TitleCompactor.compact(title)
            for title in content[: params["size"]]
        ]
        if isinstance(payload, list):
            return titles, True
        if isinstance(payload, dict):
            if isinstance(payload.get("last"), bool):
                return titles, payload["last"]
            page_number = payload.get("number")
            total_pages = payload.get("totalPages")
            if isinstance(page_number, int) and isinstance(total_pages, int):
                return titles, page_number + 1 >= total_pages
        return titles, len(content) < params["size"]

    async def _search_first_page(
        self,
        client: httpx.AsyncClient,
        *,
        headers: dict[str, str],
        search: TitleSearchRequest,
    ) -> list[dict[str, Any]]:
        titles, _ = await self._fetch_titles_page(
            client,
            headers=headers,
            search=search,
            page=0,
            size=search.requested_size,
        )
        return titles[: search.requested_size]

    async def _search_titles_with_exclusions(
        self,
        client: httpx.AsyncClient,
        *,
        headers: dict[str, str],
        search: TitleSearchRequest,
    ) -> list[dict[str, Any]]:
        collected: list[dict[str, Any]] = []
        seen_ids = set(search.excluded_ids)
        page = 0
        while (
            len(collected) < search.requested_size
            and page < MAX_EXCLUSION_SEARCH_PAGES
        ):
            titles, is_last = await self._fetch_titles_page(
                client, headers=headers, search=search, page=page, size=12
            )
            for title in titles:
                title_id = str(title.get("id") or "")
                if title_id and title_id in seen_ids:
                    continue
                if title_id:
                    seen_ids.add(title_id)
                collected.append(title)
                if len(collected) >= search.requested_size:
                    break
            if is_last:
                break
            page += 1
        return collected[: search.requested_size]


class TitleCompactor:
    """Convert data-service title payloads into compact tool results."""

    @classmethod
    def compact(cls, title: dict[str, Any]) -> dict[str, Any]:
        """Return the title fields the discovery flow needs."""
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
