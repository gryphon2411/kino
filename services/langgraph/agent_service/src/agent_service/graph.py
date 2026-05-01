"""Kino Curator agent wiring."""

from __future__ import annotations

from typing import Any

from langchain.agents import create_agent

from agent_service.config import CuratorSettings
from agent_service.llm import CuratorModelFactory
from agent_service.middleware import (
    CuratorResponseMiddleware,
    CuratorTitleAnnotationResponse,
)
from agent_service.tools import search_titles

SYSTEM_PROMPT = """You are Kino Curator.

Use only the Kino catalog results from search_titles.

Workflow:
1. Call search_titles once with the most specific supported constraints.
2. After that search, stop searching and answer from the grounded results.

Rules:
- Use search_titles before recommending unless the user is only asking how you work.
- If the user gives a release/start-year lower bound like "from 1990 onward",
  pass it as min_year in the search_titles call.
- If the user gives an upper bound like "through 2000" or a bounded range like
  "between 1990 and 2000", pass it as max_year in the search_titles call.
- Never call search_titles more than once total.
- Never retry, reformulate, or broaden the search inside the same request.
- If results are imperfect, return the best grounded matches and mention the
  limitation in plain language.
- Recommend only returned titles.
- Do not invent titles, IDs, years, genres, runtime data, or popularity signals.
- Return a short natural-language recommendation summary after tool use.
"""


def create_kino_curator() -> Any:
    """Create the Kino Curator LangGraph agent."""
    settings = CuratorSettings.from_env()
    model = CuratorModelFactory(settings).create()
    return create_agent(
        model=model,
        tools=[search_titles],
        system_prompt=SYSTEM_PROMPT,
        middleware=[
            CuratorResponseMiddleware(
                formatter_model=model.with_structured_output(
                    CuratorTitleAnnotationResponse
                )
            )
        ],
        name="kino_curator",
    )


graph = create_kino_curator()
