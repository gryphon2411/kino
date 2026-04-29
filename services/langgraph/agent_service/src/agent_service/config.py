"""Configuration for the Kino Curator."""

from __future__ import annotations

import os
from dataclasses import dataclass

GOOGLE_GENAI_PROVIDER = "google_genai"
NVIDIA_NIM_PROVIDER = "nvidia_nim"
DEFAULT_MODEL_PROVIDER = GOOGLE_GENAI_PROVIDER
DEFAULT_MODEL = "gemini-3.1-flash-lite-preview"
DEFAULT_THINKING_LEVEL = "high"
DEFAULT_DATA_SERVICE_URL = ""
DEFAULT_GOOGLE_API_KEY = "missing-google-api-key"
DEFAULT_NVIDIA_API_KEY = ""
NVIDIA_NIM_MODELS = frozenset(
    {"deepseek-ai/deepseek-v3.2", "moonshotai/kimi-k2.5"}
)


@dataclass(frozen=True)
class CuratorSettings:
    """Environment-driven configuration for Kino Curator."""

    data_service_url: str
    google_api_key: str
    model_provider: str
    model_name: str
    thinking_level: str
    nvidia_api_key: str

    @classmethod
    def from_env(cls) -> CuratorSettings:
        """Load settings from environment variables."""
        data_service_url = os.getenv(
            "KINO_DATA_SERVICE_URL", DEFAULT_DATA_SERVICE_URL
        ).rstrip("/")
        model_name = os.getenv("KINO_CURATOR_MODEL", DEFAULT_MODEL)
        model_provider = os.getenv("KINO_CURATOR_PROVIDER")
        if model_provider:
            model_provider = model_provider.strip().lower()
        else:
            model_provider = cls.provider_for_model(model_name)
        google_api_key = (
            os.getenv("GOOGLE_API_KEY")
            or os.getenv("GEMINI_API_KEY")
            or DEFAULT_GOOGLE_API_KEY
        )
        thinking_level = os.getenv(
            "KINO_CURATOR_THINKING_LEVEL", DEFAULT_THINKING_LEVEL
        )
        nvidia_api_key = os.getenv("NVIDIA_API_KEY") or DEFAULT_NVIDIA_API_KEY

        return cls(
            data_service_url=data_service_url,
            google_api_key=google_api_key,
            model_provider=model_provider,
            model_name=model_name,
            thinking_level=thinking_level,
            nvidia_api_key=nvidia_api_key,
        )

    @staticmethod
    def provider_for_model(model_name: str) -> str:
        """Infer the provider when only a model name is configured."""
        if model_name in NVIDIA_NIM_MODELS:
            return NVIDIA_NIM_PROVIDER
        return DEFAULT_MODEL_PROVIDER
