import importlib
import json

from langchain_core.messages import HumanMessage, ToolMessage

from agent_service.models import CuratorResponse

graph_module = importlib.import_module("agent_service.graph")


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

    response = graph_module.finalize_agent_state(state)

    assert response == CuratorResponse(
        notes=["Failed to query Kino data service: boom"]
    )


def test_finalize_agent_state_builds_grounded_cards() -> None:
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
            ToolMessage(
                content=json.dumps(candidates),
                tool_call_id="call-1",
                name="search_titles",
            ),
        ]
    }

    response = graph_module.finalize_agent_state(state)

    assert [card.id for card in response.cards] == ["a1", "a2", "a3"]
    assert response.cards[0].reason
    assert response.cards[0].tradeoff
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

    response = graph_module.finalize_agent_state(state)

    assert len(response.cards) == 1
    assert response.notes == [
        "The catalog search returned fewer than three grounded matches."
    ]
    assert response.cards[0].id == "a1"
    assert response.cards[0].title == "Heat"
    assert response.cards[0].year == 1995
    assert response.cards[0].titleType == "movie"
    assert response.cards[0].genres == ["Crime", "Thriller"]


def test_finalize_agent_state_reports_missing_year_matches() -> None:
    state = {
        "messages": [
            HumanMessage(
                content="Recommend thriller movies from 1990 onward."
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

    response = graph_module.finalize_agent_state(state)

    assert response.cards == []
    assert response.notes == [
        "The grounded catalog search did not return any matches from 1990 onward."
    ]
