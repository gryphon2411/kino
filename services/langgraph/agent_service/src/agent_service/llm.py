"""LLM construction for Kino Discover."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from agent_service.config import CuratorSettings
from agent_service.model_catalog import CuratorModelCatalog


@dataclass(frozen=True)
class CuratorModelFactory:
    """Build the chat model used by the discovery flow."""

    settings: CuratorSettings

    def create(self) -> BaseChatModel:
        """Create a configured chat model."""
        if (
            self.settings.model_provider
            == CuratorModelCatalog.GOOGLE_GENAI_PROVIDER
        ):
            self._raise_if_nvidia_model_uses_google()
            return self._create_google_model()
        if (
            self.settings.model_provider
            == CuratorModelCatalog.NVIDIA_NIM_PROVIDER
        ):
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
        elif self.settings.model_name.startswith(
            CuratorModelCatalog.GEMMA_MODEL_PREFIX
        ):
            # Best-effort Gemma-on-Google path. The Google wrapper exposes the
            # same thought controls used by Gemini models, but Gemma-specific
            # support still has to be validated against a live API key.
            model_kwargs["thinking_level"] = self.settings.thinking_level
            model_kwargs["include_thoughts"] = True
            model_kwargs["temperature"] = 0.2
        else:
            model_kwargs["temperature"] = 0.2

        return ChatGoogleGenerativeAI(**model_kwargs)

    def _create_nvidia_model(self) -> ChatOpenAI:
        """Create a configured NVIDIA NIM chat model."""
        model_kwargs: dict[str, Any] = {
            "base_url": CuratorModelCatalog.NVIDIA_OPENAI_BASE_URL,
            "max_retries": 0,
            "max_tokens": 192,
            "model": self.settings.model_name,
            "stream_usage": False,
            "temperature": 0,
            "timeout": 180,
            "extra_body": {"chat_template_kwargs": {"enable_thinking": False}},
        }
        if self.settings.nvidia_api_key:
            model_kwargs["api_key"] = self.settings.nvidia_api_key

        return ChatOpenAI(**model_kwargs)

    def _raise_if_nvidia_model_uses_google(self) -> None:
        """Reject NVIDIA-only model IDs on the Gemini provider."""
        if (
            self.settings.model_name
            not in CuratorModelCatalog.NVIDIA_NIM_MODELS
        ):
            return

        raise ValueError(
            f"{self.settings.model_name} is supported through "
            f"{CuratorModelCatalog.NVIDIA_NIM_PROVIDER}, not "
            f"{CuratorModelCatalog.GOOGLE_GENAI_PROVIDER}."
        )
