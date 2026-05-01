"""Structured response models for Kino Curator."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CuratorCard(BaseModel):
    """Single Kino title recommendation."""

    id: str = Field(description="Kino catalog title id.")
    title: str = Field(description="Display title.")
    year: int | None = Field(
        default=None, description="Start year when known."
    )
    titleType: str | None = Field(
        default=None, description="IMDb-style title type."
    )
    genres: list[str] = Field(
        default_factory=list, description="Known title genres."
    )
    reason: str | None = Field(
        default=None, description="Why this title fits the user request."
    )
    tradeoff: str | None = Field(
        default=None, description="One useful caveat or uncertainty."
    )


class CuratorResponse(BaseModel):
    """Structured Kino Curator response."""

    cards: list[CuratorCard] = Field(
        default_factory=list,
        description="Grounded Kino title recommendations.",
        max_length=5,
    )
    notes: list[str] = Field(
        default_factory=list,
        description="Short operational notes, such as search relaxations or missing data.",
        max_length=3,
    )
