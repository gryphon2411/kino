from agent_service.data_service import KinoDataServiceClient


def test_search_params_include_year_bounds() -> None:
    params = KinoDataServiceClient._search_params(
        free_text=None,
        genres=["Action"],
        title_type="movie",
        min_year=1990,
        max_year=2000,
        is_adult=False,
        size=8,
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
