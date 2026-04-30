"""Kino Curator agent."""

from __future__ import annotations

import json
from typing import Any, cast

from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import HumanMessage, ToolMessage
from typing_extensions import TypedDict

from agent_service.config import CuratorSettings
from agent_service.llm import CuratorModelFactory
from agent_service.models import CuratorCard, CuratorResponse
from agent_service.tools import search_titles

SYSTEM_PROMPT = """You are Kino Curator.

Use only the Kino catalog results from search_titles.

Rules:
- Use search_titles before recommending unless the user is only asking how you work.
- Make at most two search_titles calls per request.
- If the first search is weak, broaden one constraint and search once more.
- Recommend only returned titles.
- Do not invent titles, IDs, years, genres, runtime data, or popularity signals.
- Return a short natural-language recommendation summary after tool use.
"""


class SearchSnapshot(TypedDict):
    """Typed snapshot of the latest grounded search results."""

    candidates: list[dict[str, Any]]
    error: str | None


class CuratorResponseMiddleware(AgentMiddleware):
    """Attach Kino's deterministic structured response after the agent loop."""

    def after_agent(
        self, state: dict[str, Any], runtime: Any
    ) -> dict[str, Any] | None:
        """Compute the final structured response after the agent completes."""
        return {
            "structured_response": finalize_agent_state(state).model_dump()
        }


def finalize_agent_state(state: dict[str, Any]) -> CuratorResponse:
    """Build a grounded structured response from the final agent state."""
    user_request = _extract_user_request(state.get("messages", []))
    snapshot = _latest_search_snapshot(state.get("messages", []))
    if snapshot["error"]:
        return CuratorResponse(notes=[snapshot["error"]])
    if not snapshot["candidates"]:
        return CuratorResponse(
            notes=[
                "The catalog search did not return any grounded candidates."
            ]
        )
    return _fallback_response(user_request, snapshot["candidates"])


def _latest_search_snapshot(messages: list[Any]) -> SearchSnapshot:
    """Return the latest successful search result from the message list."""
    last_error: str | None = None
    for raw_message in reversed(messages):
        if not isinstance(raw_message, ToolMessage):
            continue
        if raw_message.name != "search_titles":
            continue
        payload = _parse_tool_payload(raw_message)
        if not isinstance(payload, list):
            continue
        if (
            payload
            and isinstance(payload[0], dict)
            and payload[0].get("error")
        ):
            last_error = str(payload[0]["error"])
            continue
        candidates = [
            item
            for item in payload
            if isinstance(item, dict) and item.get("id")
        ]
        if candidates:
            return SearchSnapshot(candidates=candidates, error=None)

    return SearchSnapshot(candidates=[], error=last_error)


def _parse_tool_payload(message: ToolMessage) -> Any:
    """Parse structured tool output from the message content when possible."""
    content = message.content
    if isinstance(content, str):
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return None
    if isinstance(content, list):
        return content
    return None


def _extract_user_request(messages: list[Any]) -> str:
    """Extract the latest user request from the message list."""
    for raw_message in reversed(messages):
        if not isinstance(raw_message, HumanMessage):
            continue
        content = raw_message.content
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict) and isinstance(
                    item.get("text"), str
                ):
                    parts.append(item["text"])
            return "\n".join(part for part in parts if part)
    return ""


def _fallback_response(
    user_request: str, candidates: list[dict[str, Any]]
) -> CuratorResponse:
    """Return deterministic grounded cards from the latest search result."""
    cards = [
        CuratorCard(
            id=str(candidate["id"]),
            title=str(candidate.get("title") or "Untitled"),
            year=_to_int(candidate.get("year")),
            titleType=_to_str(candidate.get("titleType")),
            genres=[
                str(genre)
                for genre in cast(list[Any], candidate.get("genres", []))
            ],
            reason=_fallback_reason(user_request, candidate),
            tradeoff=_fallback_tradeoff(candidate),
        )
        for candidate in candidates[:3]
    ]
    notes: list[str] = []
    if len(candidates) < 3:
        notes.append(
            "The catalog search returned fewer than three grounded matches."
        )
    return CuratorResponse(cards=cards, notes=notes[:3])


def _fallback_reason(user_request: str, candidate: dict[str, Any]) -> str:
    """Generate a minimal grounded reason from request and title metadata."""
    request_lower = user_request.lower()
    genres = {
        str(genre).lower()
        for genre in cast(list[Any], candidate.get("genres", []))
        if genre
    }
    reasons: list[str] = []
    if "thriller" in request_lower and "thriller" in genres:
        reasons.append("It matches the requested thriller genre.")
    title_type = str(candidate.get("titleType") or "")
    if "movie" in request_lower and title_type == "movie":
        reasons.append("It matches the requested movie format.")
    year = _to_int(candidate.get("year"))
    if year is not None and "1990 onward" in request_lower and year >= 1990:
        reasons.append(f"It fits the requested year range ({year}).")
    if not reasons:
        reasons.append(
            "It is one of the grounded matches returned by Kino's catalog search."
        )
    return " ".join(reasons[:2])


def _fallback_tradeoff(candidate: dict[str, Any]) -> str:
    """Generate a minimal grounded caveat from title metadata."""
    year = _to_int(candidate.get("year"))
    if year is None:
        return "The catalog is missing the release year for this title."
    if year < 2000:
        return "It is older than a typical contemporary recommendation."
    genres = candidate.get("genres")
    if not genres:
        return "The catalog has limited genre metadata for this title."
    return (
        "The catalog fit is based on metadata, not plot or popularity signals."
    )


def _to_int(value: Any) -> int | None:
    """Coerce optional numeric metadata into ints."""
    if value in (None, "", "\\N"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_str(value: Any) -> str | None:
    """Coerce optional metadata into strings."""
    if value in (None, ""):
        return None
    return str(value)


def create_kino_curator() -> Any:
    """Create the Kino Curator LangGraph agent."""
    settings = CuratorSettings.from_env()
    return create_agent(
        model=CuratorModelFactory(settings).create(),
        tools=[search_titles],
        system_prompt=SYSTEM_PROMPT,
        middleware=[CuratorResponseMiddleware()],
        name="kino_curator",
    )


graph = create_kino_curator()
