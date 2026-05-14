from unittest.mock import AsyncMock

import pytest

from agent_service.data_service import (
    KinoDataServiceClient,
    TitleSearchRequest,
)

pytestmark = pytest.mark.anyio


def test_search_params_include_year_bounds() -> None:
    search = TitleSearchRequest(
        free_text=None,
        genres=["Action"],
        title_type="movie",
        min_year=1990,
        max_year=2000,
        exclude_ids=None,
        is_adult=False,
        size=8,
    )
    params = KinoDataServiceClient._search_params(
        search=search, page=0, size=8
    )

    assert params == {
        "isAdult": "false",
        "page": 0,
        "size": 8,
        "genres": ["Action"],
        "titleType": "movie",
        "minYear": 1990,
        "maxYear": 2000,
    }


def test_search_params_include_page_number() -> None:
    search = TitleSearchRequest(
        free_text="fargo",
        genres=None,
        title_type=None,
        min_year=None,
        max_year=None,
        exclude_ids=None,
        is_adult=False,
        size=12,
    )
    params = KinoDataServiceClient._search_params(
        search=search, page=2, size=12
    )

    assert params["page"] == 2


async def test_search_titles_fetches_additional_pages_for_exclusions() -> None:
    client = KinoDataServiceClient(
        base_url="http://data-service/api/v1/data",
        auth_service_url="http://auth/api/v1/auth",
        auth_client_id="agent-service",
        auth_client_secret="secret",
    )

    page_results = iter(
        [
            (
                [
                    {"id": "a1", "title": "Heat"},
                    {"id": "a2", "title": "Se7en"},
                ],
                False,
            ),
            (
                [
                    {"id": "a2", "title": "Se7en"},
                    {"id": "a3", "title": "Ronin"},
                    {"id": "a4", "title": "Run Lola Run"},
                ],
                True,
            ),
        ]
    )

    async def fake_fetch_titles_page(
        *args: object, **kwargs: object
    ) -> tuple[list[dict[str, str]], bool]:
        return next(page_results)

    object.__setattr__(
        client, "_authorization_header", AsyncMock(return_value={})
    )
    object.__setattr__(client, "_fetch_titles_page", fake_fetch_titles_page)
    search = TitleSearchRequest(
        free_text=None,
        genres=["Action"],
        title_type="movie",
        min_year=None,
        max_year=None,
        exclude_ids=["a1", "a2"],
        is_adult=False,
        size=3,
    )

    result = await client.search_titles(search)

    assert result == [
        {"id": "a3", "title": "Ronin"},
        {"id": "a4", "title": "Run Lola Run"},
    ]
