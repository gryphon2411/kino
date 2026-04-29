"""LLM construction for Kino Curator."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_nvidia_ai_endpoints import ChatNVIDIA

from agent_service.config import (
    GOOGLE_GENAI_PROVIDER,
    NVIDIA_NIM_MODELS,
    NVIDIA_NIM_PROVIDER,
    CuratorSettings,
)


@dataclass(frozen=True)
class CuratorModelFactory:
    """Build the chat model used by the curator."""

    settings: CuratorSettings

    def create(self) -> BaseChatModel:
        """Create a configured chat model."""
        if self.settings.model_provider == GOOGLE_GENAI_PROVIDER:
            self._raise_if_nvidia_model_uses_google()
            return self._create_google_model()
        if self.settings.model_provider == NVIDIA_NIM_PROVIDER:
            return self._create_nvidia_model()

        raise ValueError(
            "Unsupported KINO_CURATOR_PROVIDER: "
            f"{self.settings.model_provider}"
        )

    def _create_google_model(self) -> ChatGoogleGenerativeAI:
        """Create a configured Gemini chat model."""
        model_kwargs: dict[str, Any] = {
            "api_key": self.settings.google_api_key,
            "max_retries": 1,
            "max_tokens": 900,
            "model": self.settings.model_name,
        }
        if self.settings.model_name.startswith("gemini-2.5"):
            model_kwargs["thinking_budget"] = 0
            model_kwargs["temperature"] = 0.2
        elif self.settings.model_name.startswith("gemini-3"):
            model_kwargs["thinking_level"] = self.settings.thinking_level
        else:
            model_kwargs["temperature"] = 0.2

        return ChatGoogleGenerativeAI(**model_kwargs)

    def _create_nvidia_model(self) -> ChatNVIDIA:
        """Create a configured NVIDIA NIM chat model."""
        model_kwargs: dict[str, Any] = {
            "max_completion_tokens": 900,
            "model": self.settings.model_name,
        }
        if self.settings.nvidia_api_key:
            model_kwargs["api_key"] = self.settings.nvidia_api_key

        return ChatNVIDIA(**model_kwargs)

    def _raise_if_nvidia_model_uses_google(self) -> None:
        """Reject NVIDIA-only model IDs on the Gemini provider."""
        if self.settings.model_name not in NVIDIA_NIM_MODELS:
            return

        raise ValueError(
            f"{self.settings.model_name} is supported through "
            f"{NVIDIA_NIM_PROVIDER}, not {GOOGLE_GENAI_PROVIDER}."
        )
