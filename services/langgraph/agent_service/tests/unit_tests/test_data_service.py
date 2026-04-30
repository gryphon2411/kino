from agent_service.data_service import KinoDataServiceClient


def test_search_params_include_start_year_gte() -> None:
    params = KinoDataServiceClient._search_params(
        free_text=None,
        genres=["Action"],
        title_type="movie",
        start_year_gte=1990,
        is_adult=False,
        size=8,
    )

    assert params == {
        "isAdult": "false",
        "page": 0,
        "size": 8,
        "genres": ["Action"],
        "titleType": "movie",
        "startYearGte": 1990,
    }
