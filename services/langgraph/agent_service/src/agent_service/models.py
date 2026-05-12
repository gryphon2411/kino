"""Structured response models for Kino Discover."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CuratorTitle(BaseModel):
    """Single Kino title discovery result."""

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


class CuratorResponse(BaseModel):
    """Structured Kino Discover response."""

    titles: list[CuratorTitle] = Field(
        default_factory=list,
        description="Grounded Kino title discoveries.",
        max_length=5,
    )
    notes: list[str] = Field(
        default_factory=list,
        description="Short operational notes, such as search relaxations or missing data.",
        max_length=3,
    )
