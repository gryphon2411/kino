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


class CuratorActiveContext(BaseModel):
    """Inspectable effective search arguments used for the latest turn."""

    freeText: str | None = Field(
        default=None, description="Effective free-text title search."
    )
    genres: list[str] = Field(
        default_factory=list, description="Effective genre constraints."
    )
    titleType: str | None = Field(
        default=None, description="Effective title format constraint."
    )
    minYear: int | None = Field(
        default=None, description="Effective lower year bound."
    )
    maxYear: int | None = Field(
        default=None, description="Effective upper year bound."
    )
    isAdult: bool = Field(
        default=False, description="Whether adult titles are allowed."
    )
    excludedTitleIds: list[str] = Field(
        default_factory=list,
        description="Explicitly excluded prior title IDs for this thread.",
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
    activeContext: CuratorActiveContext = Field(
        default_factory=CuratorActiveContext,
        description="Effective search arguments used for this response turn.",
    )
