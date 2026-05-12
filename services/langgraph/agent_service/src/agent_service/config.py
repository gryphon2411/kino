"""Configuration for Kino Discover."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import ClassVar

from agent_service.model_catalog import CuratorModelCatalog


@dataclass(frozen=True)
class CuratorSettings:
    """Environment-driven configuration for Kino Discover."""

    DEFAULT_MODEL: ClassVar[str] = "gemini-3.1-flash-lite-preview"
    DEFAULT_THINKING_LEVEL: ClassVar[str] = "high"
    DEFAULT_DATA_SERVICE_URL: ClassVar[str] = ""
    DEFAULT_AUTH_SERVICE_URL: ClassVar[str] = ""
    DEFAULT_AUTH_CLIENT_ID: ClassVar[str] = ""
    DEFAULT_AUTH_CLIENT_SECRET: ClassVar[str] = ""
    DEFAULT_GOOGLE_API_KEY: ClassVar[str] = "missing-google-api-key"
    DEFAULT_NVIDIA_API_KEY: ClassVar[str] = ""

    data_service_url: str
    auth_service_url: str
    auth_client_id: str
    auth_client_secret: str
    google_api_key: str
    model_provider: str
    model_name: str
    thinking_level: str
    nvidia_api_key: str

    @classmethod
    def from_env(cls) -> CuratorSettings:
        """Load settings from environment variables."""
        data_service_url = os.getenv(
            "KINO_DATA_SERVICE_URL", cls.DEFAULT_DATA_SERVICE_URL
        ).rstrip("/")
        auth_service_url = os.getenv(
            "KINO_AUTH_SERVICE_URL", cls.DEFAULT_AUTH_SERVICE_URL
        ).rstrip("/")
        auth_client_id = os.getenv(
            "KINO_AUTH_CLIENT_ID", cls.DEFAULT_AUTH_CLIENT_ID
        )
        auth_client_secret = os.getenv(
            "KINO_AUTH_CLIENT_SECRET", cls.DEFAULT_AUTH_CLIENT_SECRET
        )
        model_name = os.getenv("KINO_CURATOR_MODEL", cls.DEFAULT_MODEL)
        model_provider = os.getenv("KINO_CURATOR_PROVIDER")
        if model_provider:
            model_provider = model_provider.strip().lower()
        else:
            model_provider = CuratorModelCatalog.provider_for_model(model_name)
        google_api_key = (
            os.getenv("GOOGLE_API_KEY")
            or os.getenv("GEMINI_API_KEY")
            or cls.DEFAULT_GOOGLE_API_KEY
        )
        thinking_level = os.getenv(
            "KINO_CURATOR_THINKING_LEVEL", cls.DEFAULT_THINKING_LEVEL
        )
        nvidia_api_key = (
            os.getenv("NVIDIA_API_KEY") or cls.DEFAULT_NVIDIA_API_KEY
        )

        return cls(
            data_service_url=data_service_url,
            auth_service_url=auth_service_url,
            auth_client_id=auth_client_id,
            auth_client_secret=auth_client_secret,
            google_api_key=google_api_key,
            model_provider=model_provider,
            model_name=model_name,
            thinking_level=thinking_level,
            nvidia_api_key=nvidia_api_key,
        )
