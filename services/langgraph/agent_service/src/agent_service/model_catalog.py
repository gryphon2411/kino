"""Static provider and model-family policy for Kino Discover."""

from __future__ import annotations

from dataclasses import dataclass
from typing import ClassVar


@dataclass(frozen=True)
class CuratorModelCatalog:
    """Known provider names, model families, and routing rules."""

    GOOGLE_GENAI_PROVIDER: ClassVar[str] = "google_genai"
    NVIDIA_NIM_PROVIDER: ClassVar[str] = "nvidia_nim"
    DEFAULT_MODEL_PROVIDER: ClassVar[str] = GOOGLE_GENAI_PROVIDER
    NVIDIA_OPENAI_BASE_URL: ClassVar[str] = (
        "https://integrate.api.nvidia.com/v1"
    )
    GEMMA_MODEL_PREFIX: ClassVar[str] = "gemma-"
    NVIDIA_NIM_MODELS: ClassVar[frozenset[str]] = frozenset(
        {"deepseek-ai/deepseek-v3.2", "moonshotai/kimi-k2.5", "z-ai/glm-5.1"}
    )

    @classmethod
    def provider_for_model(cls, model_name: str) -> str:
        """Infer the provider when only a model name is configured."""
        if model_name in cls.NVIDIA_NIM_MODELS:
            return cls.NVIDIA_NIM_PROVIDER
        return cls.DEFAULT_MODEL_PROVIDER
