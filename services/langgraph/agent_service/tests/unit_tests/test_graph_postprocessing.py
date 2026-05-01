import importlib
import json
from unittest.mock import Mock

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from agent_service.models import CuratorResponse

middleware_module = importlib.import_module("agent_service.middleware")
builder = middleware_module.CuratorResponseBuilder
middleware = middleware_module.CuratorResponseMiddleware


def test_finalize_agent_state_returns_tool_error_note() -> None:
    state = {
        "messages": [
            HumanMessage(content="Recommend a thriller movie."),
            ToolMessage(
                content=json.dumps(
                    [{"error": "Failed to query Kino data service: boom"}]
                ),
                tool_call_id="call-1",
                name="search_titles",
            ),
        ]
    }

    response = builder.finalize_agent_state(state)

    assert response == CuratorResponse(
        notes=["Failed to query Kino data service: boom"]
    )


def test_finalize_agent_state_builds_grounded_titles() -> None:
    candidates = [
        {
            "id": "a1",
            "title": "Heat",
            "year": 1995,
            "titleType": "movie",
            "genres": ["Crime", "Thriller"],
        },
        {
            "id": "a2",
            "title": "Se7en",
            "year": 1995,
            "titleType": "movie",
            "genres": ["Crime", "Mystery", "Thriller"],
        },
        {
            "id": "a3",
            "title": "Prisoners",
            "year": 2013,
            "titleType": "movie",
            "genres": ["Crime", "Drama", "Thriller"],
        },
    ]
    state = {
        "messages": [
            HumanMessage(
                content=(
                    "Recommend exactly 3 non-adult thriller movies from 1990 "
                    "onward."
                )
            ),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "search_titles",
                        "args": {
                            "genres": ["Thriller"],
                            "title_type": "movie",
                            "min_year": 1990,
                            "is_adult": False,
                            "size": 8,
                        },
                        "id": "call-1",
                        "type": "tool_call",
                    }
                ],
            ),
            ToolMessage(
                content=json.dumps(candidates),
                tool_call_id="call-1",
                name="search_titles",
            ),
        ]
    }

    response = builder.finalize_agent_state(state)

    assert [title.id for title in response.titles] == ["a1", "a2", "a3"]
    assert response.notes == []


def test_finalize_agent_state_uses_grounded_candidate_fields() -> None:
    state = {
        "messages": [
            HumanMessage(content="Recommend a grounded thriller movie."),
            ToolMessage(
                content=json.dumps(
                    [
                        {
                            "id": "a1",
                            "title": "Heat",
                            "year": 1995,
                            "titleType": "movie",
                            "genres": ["Crime", "Thriller"],
                        }
                    ]
                ),
                tool_call_id="call-1",
                name="search_titles",
            ),
        ]
    }

    response = builder.finalize_agent_state(state)

    assert len(response.titles) == 1
    assert response.notes == [
        "The catalog search returned fewer than three grounded matches."
    ]
    assert response.titles[0].id == "a1"
    assert response.titles[0].title == "Heat"
    assert response.titles[0].year == 1995
    assert response.titles[0].titleType == "movie"
    assert response.titles[0].genres == ["Crime", "Thriller"]


def test_finalize_agent_state_reports_missing_year_matches() -> None:
    state = {
        "messages": [
            HumanMessage(
                content="Recommend thriller movies from 1990 onward."
            ),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "search_titles",
                        "args": {"genres": ["Thriller"], "min_year": 1990},
                        "id": "call-1",
                        "type": "tool_call",
                    }
                ],
            ),
            ToolMessage(
                content=json.dumps(
                    [
                        {
                            "id": "a1",
                            "title": "The Man Who Disappeared",
                            "year": 1914,
                            "titleType": "movie",
                            "genres": ["Thriller"],
                        }
                    ]
                ),
                tool_call_id="call-1",
                name="search_titles",
            ),
        ]
    }

    response = builder.finalize_agent_state(state)

    assert response.titles == []
    assert response.notes == [
        "The grounded catalog search did not return any matches from 1990 onward."
    ]


def test_finalize_agent_state_applies_bounded_year_range() -> None:
    state = {
        "messages": [
            HumanMessage(content="Recommend thriller movies."),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "search_titles",
                        "args": {
                            "genres": ["Thriller"],
                            "min_year": 1990,
                            "max_year": 2000,
                        },
                        "id": "call-1",
                        "type": "tool_call",
                    }
                ],
            ),
            ToolMessage(
                content=json.dumps(
                    [
                        {
                            "id": "a1",
                            "title": "Heat",
                            "year": 1995,
                            "titleType": "movie",
                            "genres": ["Crime", "Thriller"],
                        },
                        {
                            "id": "a2",
                            "title": "Prisoners",
                            "year": 2013,
                            "titleType": "movie",
                            "genres": ["Crime", "Drama", "Thriller"],
                        },
                    ]
                ),
                tool_call_id="call-1",
                name="search_titles",
            ),
        ]
    }

    response = builder.finalize_agent_state(state)

    assert [title.id for title in response.titles] == ["a1"]
    assert response.notes == [
        "The catalog search returned fewer than three grounded matches."
    ]


def test_finalize_agent_state_reads_year_bounds_from_tool_args() -> None:
    state = {
        "messages": [
            HumanMessage(content="Recommend action movies."),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "search_titles",
                        "args": {
                            "genres": ["Action"],
                            "min_year": 1990,
                            "max_year": 2000,
                        },
                        "id": "call-1",
                        "type": "tool_call",
                    }
                ],
            ),
            ToolMessage(
                content=json.dumps(
                    [
                        {
                            "id": "a1",
                            "title": "Bloody Hero",
                            "year": 1991,
                            "titleType": "movie",
                            "genres": ["Action", "Drama"],
                        },
                        {
                            "id": "a2",
                            "title": "Tötet nicht mehr",
                            "year": 2019,
                            "titleType": "movie",
                            "genres": ["Action", "Crime"],
                        },
                    ]
                ),
                tool_call_id="call-1",
                name="search_titles",
            ),
        ]
    }

    response = builder.finalize_agent_state(state)

    assert [title.id for title in response.titles] == ["a1"]


def test_finalize_agent_state_does_not_parse_year_bounds_from_prompt() -> None:
    state = {
        "messages": [
            HumanMessage(content="Recommend action movies from 1990 onward."),
            ToolMessage(
                content=json.dumps(
                    [
                        {
                            "id": "a1",
                            "title": "The Story of the Kelly Gang",
                            "year": 1906,
                            "titleType": "movie",
                            "genres": ["Action", "Biography", "Crime"],
                        },
                        {
                            "id": "a2",
                            "title": "Bloody Hero",
                            "year": 1991,
                            "titleType": "movie",
                            "genres": ["Action", "Drama"],
                        },
                    ]
                ),
                tool_call_id="call-1",
                name="search_titles",
            ),
        ]
    }

    response = builder.finalize_agent_state(state)

    assert [title.id for title in response.titles] == ["a1", "a2"]
    assert response.notes == [
        "The catalog search returned fewer than three grounded matches."
    ]


def test_sync_middleware_short_circuits_after_search() -> None:
    request = Mock()
    request.state = {
        "messages": [
            HumanMessage(
                content="Recommend thriller movies from 1990 onward."
            ),
            ToolMessage(
                content=json.dumps(
                    [
                        {
                            "id": "a1",
                            "title": "Heat",
                            "year": 1995,
                            "titleType": "movie",
                            "genres": ["Crime", "Thriller"],
                        }
                    ]
                ),
                tool_call_id="call-1",
                name="search_titles",
            ),
        ]
    }
    response_middleware = middleware()
    handler = Mock()

    result = response_middleware.wrap_model_call(request, handler)

    assert (
        result.content
        == "Based on Kino's catalog, I can ground this match: Heat (1995). Note: The catalog search returned fewer than three grounded matches."
    )
    handler.assert_not_called()


def test_after_agent_returns_deterministic_titles_only() -> None:
    response_middleware = middleware()

    result = response_middleware.after_agent(
        {
            "messages": [
                HumanMessage(
                    content="Discover action movies from 1990 onward."
                ),
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "search_titles",
                            "args": {"genres": ["Action"], "min_year": 1990},
                            "id": "call-1",
                            "type": "tool_call",
                        }
                    ],
                ),
                ToolMessage(
                    content=json.dumps(
                        [
                            {
                                "id": "a1",
                                "title": "Heat",
                                "year": 1995,
                                "titleType": "movie",
                                "genres": ["Crime", "Thriller"],
                            }
                        ]
                    ),
                    tool_call_id="call-1",
                    name="search_titles",
                ),
            ]
        },
        runtime=None,
    )

    assert result == {
        "structured_response": {
            "titles": [
                {
                    "id": "a1",
                    "title": "Heat",
                    "year": 1995,
                    "titleType": "movie",
                    "genres": ["Crime", "Thriller"],
                }
            ],
            "notes": [
                "The catalog search returned fewer than three grounded matches."
            ],
        }
    }
