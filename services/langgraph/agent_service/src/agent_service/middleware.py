"""Middleware and deterministic post-processing for Kino Curator."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, ClassVar, cast

from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from agent_service.models import CuratorResponse, CuratorTitle

logger = logging.getLogger(__name__)


class SearchSnapshot(TypedDict):
    """Typed snapshot of the latest grounded search results."""

    candidates: list[dict[str, Any]]
    error: str | None
    args: dict[str, Any] | None


class CuratorResponseMiddleware(AgentMiddleware):
    """Attach Kino's deterministic structured response after the agent loop."""

    def __init__(self, formatter_model: Any) -> None:
        """Initialize middleware with the shared formatter model."""
        self._formatter = CuratorResponseFormatter(formatter_model)

    def wrap_model_call(self, request: Any, handler: Any) -> Any:
        """Skip the post-tool model pass and return a grounded summary."""
        messages = request.state.get("messages", [])
        if CuratorResponseBuilder.should_short_circuit_after_search(messages):
            response = CuratorResponseBuilder.finalize_agent_state(
                request.state
            )
            return AIMessage(
                content=CuratorResponseBuilder.natural_language_summary(
                    response
                )
            )
        return handler(request)

    async def awrap_model_call(self, request: Any, handler: Any) -> Any:
        """Skip the post-tool model pass and return a grounded summary."""
        messages = request.state.get("messages", [])
        if CuratorResponseBuilder.should_short_circuit_after_search(messages):
            response = CuratorResponseBuilder.finalize_agent_state(
                request.state
            )
            return AIMessage(
                content=CuratorResponseBuilder.natural_language_summary(
                    response
                )
            )
        return await handler(request)

    def after_agent(
        self, state: dict[str, Any], runtime: Any
    ) -> dict[str, Any] | None:
        """Compute the final structured response after the agent completes."""
        response = CuratorResponseBuilder.finalize_agent_state(state)
        response = self._formatter.format_response(state, response)
        return {"structured_response": response.model_dump()}

    async def aafter_agent(
        self, state: dict[str, Any], runtime: Any
    ) -> dict[str, Any] | None:
        """Compute the final structured response after the agent completes."""
        response = CuratorResponseBuilder.finalize_agent_state(state)
        response = await self._formatter.aformat_response(state, response)
        return {"structured_response": response.model_dump()}


class CuratorResponseBuilder:
    """Build grounded summaries and structured responses from agent state."""

    @classmethod
    def finalize_agent_state(cls, state: dict[str, Any]) -> CuratorResponse:
        """Build a grounded structured response from the final agent state."""
        user_request = cls.extract_user_request(state.get("messages", []))
        snapshot = cls.latest_search_snapshot(state.get("messages", []))
        if snapshot["error"]:
            return CuratorResponse(notes=[snapshot["error"]])
        candidates, notes = cls.apply_request_filters(
            user_request, snapshot["candidates"], snapshot["args"]
        )
        if not candidates:
            return CuratorResponse(
                notes=notes
                or [
                    "The catalog search did not return any grounded candidates."
                ]
            )
        response = cls.fallback_response(user_request, candidates)
        response.notes = [*notes, *response.notes][:3]
        return response

    @staticmethod
    def should_short_circuit_after_search(messages: list[Any]) -> bool:
        """Return true when the next model call follows search_titles output."""
        return (
            bool(messages)
            and isinstance(messages[-1], ToolMessage)
            and messages[-1].name == "search_titles"
        )

    @classmethod
    def latest_search_snapshot(cls, messages: list[Any]) -> SearchSnapshot:
        """Return the latest successful search result from the message list."""
        last_error: str | None = None
        for index in range(len(messages) - 1, -1, -1):
            raw_message = messages[index]
            if not isinstance(raw_message, ToolMessage):
                continue
            if raw_message.name != "search_titles":
                continue
            payload = cls.parse_tool_payload(raw_message)
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
                return SearchSnapshot(
                    candidates=candidates,
                    error=None,
                    args=cls.latest_search_args(
                        messages[:index],
                        getattr(raw_message, "tool_call_id", None),
                    ),
                )

        return SearchSnapshot(candidates=[], error=last_error, args=None)

    @classmethod
    def latest_search_args(
        cls, messages: list[Any], tool_call_id: str | None
    ) -> dict[str, Any] | None:
        """Return normalized tool arguments for the latest search call."""
        if not tool_call_id:
            return None
        for raw_message in reversed(messages):
            if not isinstance(raw_message, AIMessage):
                continue
            for tool_call in reversed(raw_message.tool_calls):
                if tool_call.get("name") != "search_titles":
                    continue
                if tool_call.get("id") != tool_call_id:
                    continue
                return cls.normalize_tool_args(tool_call.get("args"))
        return None

    @staticmethod
    def normalize_tool_args(raw_args: Any) -> dict[str, Any] | None:
        """Normalize raw tool-call args into a dictionary when possible."""
        if isinstance(raw_args, str):
            try:
                raw_args = json.loads(raw_args)
            except json.JSONDecodeError:
                return None
        if not isinstance(raw_args, dict):
            return None
        return {str(key): value for key, value in raw_args.items()}

    @staticmethod
    def parse_tool_payload(message: ToolMessage) -> Any:
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

    @staticmethod
    def extract_user_request(messages: list[Any]) -> str:
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

    @classmethod
    def apply_request_filters(
        cls,
        user_request: str,
        candidates: list[dict[str, Any]],
        search_args: dict[str, Any] | None,
    ) -> tuple[list[dict[str, Any]], list[str]]:
        """Apply minimal deterministic filtering for explicit constraints."""
        notes: list[str] = []
        filtered = candidates

        min_year, max_year = cls.effective_year_bounds(
            user_request, search_args
        )
        if min_year is not None or max_year is not None:
            year_filtered = [
                candidate
                for candidate in filtered
                if (year := cls.to_int(candidate.get("year"))) is not None
                and (min_year is None or year >= min_year)
                and (max_year is None or year <= max_year)
            ]
            if year_filtered:
                filtered = year_filtered
            else:
                notes.append(
                    cls.year_range_note(min_year=min_year, max_year=max_year)
                )
                return [], notes

        return filtered, notes

    @classmethod
    def effective_year_bounds(
        cls, user_request: str, search_args: dict[str, Any] | None
    ) -> tuple[int | None, int | None]:
        """Return year bounds from tool args, falling back to legacy parsing."""
        min_year = cls.to_int((search_args or {}).get("min_year"))
        max_year = cls.to_int((search_args or {}).get("max_year"))
        if min_year is not None or max_year is not None:
            return min_year, max_year
        return cls.requested_year_bounds(user_request)

    @classmethod
    def requested_year_bounds(
        cls, user_request: str
    ) -> tuple[int | None, int | None]:
        """Extract simple release/start-year bounds from common phrasing."""
        request = user_request.lower()

        match = re.search(
            r"\bbetween\s+((?:19|20)\d{2})\s+and\s+((?:19|20)\d{2})\b", request
        )
        if match:
            start = int(match.group(1))
            end = int(match.group(2))
            return min(start, end), max(start, end)

        match = re.search(
            r"\bfrom\s+((?:19|20)\d{2})\s+to\s+((?:19|20)\d{2})\b", request
        )
        if match:
            start = int(match.group(1))
            end = int(match.group(2))
            return min(start, end), max(start, end)

        match = re.search(
            r"\bfrom\s+((?:19|20)\d{2})\s+(?:onward|onwards|or later)\b",
            request,
        )
        if match:
            return int(match.group(1)), None

        match = re.search(
            r"\b((?:19|20)\d{2})\s*(?:\+|and up|onward|onwards|or later)\b",
            request,
        )
        if match:
            return int(match.group(1)), None

        match = re.search(
            r"\b(?:through|until|up to)\s+((?:19|20)\d{2})\b", request
        )
        if match:
            return None, int(match.group(1))

        return None, None

    @staticmethod
    def year_range_note(min_year: int | None, max_year: int | None) -> str:
        """Render a short note for unmet year-bound search results."""
        if min_year is not None and max_year is not None:
            return (
                "The grounded catalog search did not return any matches "
                f"between {min_year} and {max_year}."
            )
        if min_year is not None:
            return (
                "The grounded catalog search did not return any matches "
                f"from {min_year} onward."
            )
        return (
            "The grounded catalog search did not return any matches "
            f"through {max_year}."
        )

    @classmethod
    def fallback_response(
        cls, user_request: str, candidates: list[dict[str, Any]]
    ) -> CuratorResponse:
        """Return deterministic grounded titles from the latest search result."""
        titles = [
            CuratorTitle(
                id=str(candidate["id"]),
                title=str(candidate.get("title") or "Untitled"),
                year=cls.to_int(candidate.get("year")),
                titleType=cls.to_str(candidate.get("titleType")),
                genres=[
                    str(genre)
                    for genre in cast(list[Any], candidate.get("genres", []))
                ],
                reason=None,
            )
            for candidate in candidates[:3]
        ]
        notes: list[str] = []
        if len(candidates) < 3:
            notes.append(
                "The catalog search returned fewer than three grounded matches."
            )
        return CuratorResponse(titles=titles, notes=notes[:3])

    @staticmethod
    def natural_language_summary(response: CuratorResponse) -> str:
        """Build a short grounded summary without another model call."""
        if not response.titles:
            if response.notes:
                return response.notes[0]
            return "I could not find grounded matches in Kino's catalog."

        titles = [
            f"{title.title} ({title.year})"
            if title.year is not None
            else title.title
            for title in response.titles
        ]
        if len(titles) == 1:
            summary = f"Based on Kino's catalog, I can ground this match: {titles[0]}."
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

    @staticmethod
    def to_int(value: Any) -> int | None:
        """Coerce optional numeric metadata into ints."""
        if value in (None, "", "\\N"):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def to_str(value: Any) -> str | None:
        """Coerce optional metadata into strings."""
        if value in (None, ""):
            return None
        return str(value)


class CuratorTitleAnnotation(BaseModel):
    """Optional formatter output for a selected recommendation title."""

    id: str = Field(description="Selected Kino catalog title id.")
    reason: str | None = Field(
        default=None, description="Short grounded fit explanation."
    )


class CuratorTitleAnnotationResponse(BaseModel):
    """Structured formatter output for selected recommendation titles."""

    titles: list[CuratorTitleAnnotation] = Field(
        default_factory=list,
        description="Formatter annotations keyed by selected title id.",
        max_length=5,
    )


class CuratorResponseFormatter:
    """Use the model only to enrich selected titles with optional text."""

    SYSTEM_PROMPT: ClassVar[str] = """
You are formatting already-selected Kino recommendation titles.

Use only:
- the user request
- the provided title metadata

Rules:
- Do not add, remove, reorder, or change title ids.
- Do not change title, year, titleType, or genres.
- Fill only reason.
- Do not invent plots, popularity, ratings, runtime, tone, or themes not present in the metadata.
- If the provided request and metadata do not support a grounded reason, return null.
- Keep each reason to one short sentence.
- Prefer natural phrasing that combines the useful metadata instead of a rigid field-by-field template.
""".strip()

    def __init__(self, formatter_model: Any) -> None:
        """Initialize the formatter with a preconfigured structured model."""
        self._structured_model = formatter_model

    def format_response(
        self, state: dict[str, Any], response: CuratorResponse
    ) -> CuratorResponse:
        """Enrich grounded titles with optional text synchronously."""
        if not response.titles:
            return response
        try:
            annotations = self._structured_model.invoke(
                self._formatter_prompt(
                    CuratorResponseBuilder.extract_user_request(
                        state.get("messages", [])
                    ),
                    response.titles,
                )
            )
        except Exception:
            logger.exception("Failed to format curator title annotations.")
            return response
        return self._merge_annotations(response, annotations)

    async def aformat_response(
        self, state: dict[str, Any], response: CuratorResponse
    ) -> CuratorResponse:
        """Enrich grounded titles with optional text asynchronously."""
        if not response.titles:
            return response
        try:
            annotations = await self._structured_model.ainvoke(
                self._formatter_prompt(
                    CuratorResponseBuilder.extract_user_request(
                        state.get("messages", [])
                    ),
                    response.titles,
                )
            )
        except Exception:
            logger.exception("Failed to format curator title annotations.")
            return response
        return self._merge_annotations(response, annotations)

    @classmethod
    def _formatter_prompt(
        cls, user_request: str, titles: list[CuratorTitle]
    ) -> str:
        """Render formatter input from the selected titles."""
        payload = {
            "user_request": user_request,
            "titles": [
                {
                    "id": title.id,
                    "title": title.title,
                    "year": title.year,
                    "titleType": title.titleType,
                    "genres": title.genres,
                }
                for title in titles
            ],
        }
        return (
            f"{cls.SYSTEM_PROMPT}\n\n"
            "Input JSON:\n"
            f"{json.dumps(payload, ensure_ascii=False)}"
        )

    @classmethod
    def _merge_annotations(
        cls,
        response: CuratorResponse,
        annotations: CuratorTitleAnnotationResponse | Any,
    ) -> CuratorResponse:
        """Merge formatter output onto already-selected titles by id."""
        if not isinstance(annotations, CuratorTitleAnnotationResponse):
            return response

        merged = response.model_copy(deep=True)
        annotation_map = {item.id: item for item in annotations.titles}
        for title in merged.titles:
            annotation = annotation_map.get(title.id)
            if annotation is None:
                continue
            title.reason = cls._normalize_optional_text(annotation.reason)
        return merged

    @staticmethod
    def _normalize_optional_text(value: str | None) -> str | None:
        """Normalize empty formatter fields to null."""
        if value is None:
            return None
        value = value.strip()
        return value or None
