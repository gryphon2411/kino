import pytest

from agent_service.tools import search_titles

pytestmark = pytest.mark.anyio


async def test_search_titles_reports_missing_data_service_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("KINO_DATA_SERVICE_URL", raising=False)

    result = await search_titles.ainvoke({"free_text": "fargo"})

    assert result == [{"error": "KINO_DATA_SERVICE_URL is not configured."}]
