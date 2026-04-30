import pytest

from agent_service.tools import search_titles

pytestmark = pytest.mark.anyio


async def test_search_titles_reports_missing_data_service_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("KINO_DATA_SERVICE_URL", raising=False)

    result = await search_titles.ainvoke({"free_text": "fargo"})

    assert result == [{"error": "KINO_DATA_SERVICE_URL is not configured."}]


async def test_search_titles_reports_missing_machine_auth_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "KINO_DATA_SERVICE_URL", "http://data-service:8082/api/v1/data"
    )
    monkeypatch.delenv("KINO_AUTH_SERVICE_URL", raising=False)
    monkeypatch.delenv("KINO_AUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("KINO_AUTH_CLIENT_SECRET", raising=False)

    result = await search_titles.ainvoke({"free_text": "fargo"})

    assert result == [
        {
            "error": (
                "Failed to authenticate against Kino auth service: "
                "KINO_AUTH_SERVICE_URL, KINO_AUTH_CLIENT_ID, and "
                "KINO_AUTH_CLIENT_SECRET must be configured."
            )
        }
    ]
