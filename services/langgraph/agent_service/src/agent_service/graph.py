"""Kino Curator agent."""

from __future__ import annotations

import json
import re
from typing import Any, cast

from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from typing_extensions import TypedDict

from agent_service.config import CuratorSettings
from agent_service.llm import CuratorModelFactory
from agent_service.models import CuratorCard, CuratorResponse
from agent_service.tools import search_titles

SYSTEM_PROMPT = """You are Kino Curator.

Use only the Kino catalog results from search_titles.

Workflow:
1. Call search_titles once with the most specific supported constraints.
2. After that search, stop searching and answer from the grounded results.

Rules:
- Use search_titles before recommending unless the user is only asking how you work.
- If the user gives a minimum year like "from 1990 onward", pass it as
  start_year_gte in the search_titles call.
- Never call search_titles more than once total.
- Never retry, reformulate, or broaden the search inside the same request.
- If results are imperfect, return the best grounded matches and mention the
  limitation in plain language.
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

    async def awrap_model_call(self, request: Any, handler: Any) -> Any:
        """Skip the post-tool model pass and return a grounded summary."""
        messages = request.state.get("messages", [])
        if _should_short_circuit_after_search(messages):
            response = finalize_agent_state(request.state)
            return AIMessage(content=_natural_language_summary(response))
        return await handler(request)

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
    candidates, notes = _apply_request_filters(
        user_request, snapshot["candidates"]
    )
    if not candidates:
        return CuratorResponse(
            notes=notes
            or ["The catalog search did not return any grounded candidates."]
        )
    response = _fallback_response(user_request, candidates)
    response.notes = [*notes, *response.notes][:3]
    return response


def _should_short_circuit_after_search(messages: list[Any]) -> bool:
    """Return true when the next model call follows search_titles output."""
    return (
        bool(messages)
        and isinstance(messages[-1], ToolMessage)
        and messages[-1].name == "search_titles"
    )


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


def _apply_request_filters(
    user_request: str, candidates: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[str]]:
    """Apply minimal deterministic filtering for explicit request constraints."""
    notes: list[str] = []
    filtered = candidates

    min_year = _requested_min_year(user_request)
    if min_year is not None:
        year_filtered = [
            candidate
            for candidate in filtered
            if (year := _to_int(candidate.get("year"))) is not None
            and year >= min_year
        ]
        if year_filtered:
            filtered = year_filtered
        else:
            notes.append(
                "The grounded catalog search did not return any matches "
                f"from {min_year} onward."
            )
            return [], notes

    return filtered, notes


def _requested_min_year(user_request: str) -> int | None:
    """Extract a minimum year constraint from common request phrasing."""
    match = re.search(
        r"\bfrom\s+((?:19|20)\d{2})\s+(?:onward|onwards|or later)\b",
        user_request.lower(),
    )
    if match:
        return int(match.group(1))

    match = re.search(
        r"\b((?:19|20)\d{2})\s*(?:\+|and up|onward|onwards|or later)\b",
        user_request.lower(),
    )
    if match:
        return int(match.group(1))

    return None


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
    if "action" in request_lower and "action" in genres:
        reasons.append("It matches the requested action genre.")
    title_type = str(candidate.get("titleType") or "")
    if "movie" in request_lower and title_type == "movie":
        reasons.append("It matches the requested movie format.")
    year = _to_int(candidate.get("year"))
    min_year = _requested_min_year(user_request)
    if year is not None and min_year is not None and year >= min_year:
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


def _natural_language_summary(response: CuratorResponse) -> str:
    """Build a short grounded summary without another model call."""
    if not response.cards:
        if response.notes:
            return response.notes[0]
        return "I could not find grounded matches in Kino's catalog."

    titles = [
        (
            f"{card.title} ({card.year})"
            if card.year is not None
            else card.title
        )
        for card in response.cards
    ]
    if len(titles) == 1:
        summary = (
            f"Based on Kino's catalog, I can ground this match: {titles[0]}."
        )
    elif len(titles) == 2:
        summary = (
            "Based on Kino's catalog, I can ground these matches: "
            f"{titles[0]} and {titles[1]}."
        )
    else:
        summary = (
            "Based on Kino's catalog, I can ground these matches: "
            f"{titles[0]}, {titles[1]}, and {titles[2]}."
        )

    if response.notes:
        return f"{summary} Note: {response.notes[0]}"
    return summary


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
