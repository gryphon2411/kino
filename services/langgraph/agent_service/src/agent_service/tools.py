"""Tools available to Kino Curator."""

from __future__ import annotations

from typing import Any

from langchain_core.tools import tool

from agent_service.config import CuratorSettings
from agent_service.data_service import KinoDataServiceClient


@tool(parse_docstring=True)
async def search_titles(
    free_text: str | None = None,
    genres: list[str] | None = None,
    title_type: str | None = None,
    is_adult: bool = False,
    size: int = 8,
) -> list[dict[str, Any]]:
    """Search Kino's local IMDb title catalog.

    Use this tool to retrieve real Kino catalog candidates before making
    recommendations. The tool returns compact title records with id, title, year,
    title type, runtime minutes, and genres. It does not return plots, ratings,
    popularity, trend data, or external web results. If the request mentions
    constraints this tool does not support directly, such as decade or runtime,
    search by the closest supported fields first and filter/rank from the
    returned records.

    Args:
        free_text: Keyword or title text for Kino's text search. Use short phrases
            such as "fargo", "space", or "detective"; leave empty for broad
            genre/type searches.
        genres: IMDb-style genres to filter by, such as ["Thriller"],
            ["Comedy", "Romance"], or ["Sci-Fi"]. Use an empty value when genre
            is unknown or the first search should be broad.
        title_type: IMDb-style title type, such as "movie", "tvSeries",
            "tvEpisode", or "short". Leave empty unless the user asks for a
            specific format.
        is_adult: Whether adult titles are allowed. Keep false unless the user
            explicitly asks to include adult content.
        size: Number of candidates to return. Use 5 to 12; default is 8.
    """
    settings = CuratorSettings.from_env()
    client = KinoDataServiceClient(
        base_url=settings.data_service_url,
        auth_service_url=settings.auth_service_url,
        auth_client_id=settings.auth_client_id,
        auth_client_secret=settings.auth_client_secret,
    )
    return await client.search_titles(
        free_text=free_text,
        genres=genres,
        title_type=title_type,
        is_adult=is_adult,
        size=size,
    )
