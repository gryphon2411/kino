import pytest
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from agent_service.config import (
    DEFAULT_AUTH_CLIENT_ID,
    DEFAULT_AUTH_CLIENT_SECRET,
    DEFAULT_AUTH_SERVICE_URL,
    DEFAULT_DATA_SERVICE_URL,
    DEFAULT_GOOGLE_API_KEY,
    DEFAULT_THINKING_LEVEL,
    GOOGLE_GENAI_PROVIDER,
    NVIDIA_NIM_PROVIDER,
    CuratorSettings,
)
from agent_service.llm import CuratorModelFactory


def test_settings_infers_nvidia_provider_for_kimi(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("KINO_CURATOR_PROVIDER", raising=False)
    monkeypatch.setenv("KINO_CURATOR_MODEL", "moonshotai/kimi-k2.5")

    settings = CuratorSettings.from_env()

    assert settings.model_provider == NVIDIA_NIM_PROVIDER


def test_settings_infers_nvidia_provider_for_glm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("KINO_CURATOR_PROVIDER", raising=False)
    monkeypatch.setenv("KINO_CURATOR_MODEL", "z-ai/glm-5.1")

    settings = CuratorSettings.from_env()

    assert settings.model_provider == NVIDIA_NIM_PROVIDER


def test_settings_reads_nvidia_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("KINO_CURATOR_PROVIDER", "NVIDIA_NIM")
    monkeypatch.setenv("KINO_CURATOR_MODEL", "deepseek-ai/deepseek-v3.2")
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-test")

    settings = CuratorSettings.from_env()

    assert settings.model_provider == NVIDIA_NIM_PROVIDER
    assert settings.model_name == "deepseek-ai/deepseek-v3.2"
    assert settings.nvidia_api_key == "nvapi-test"


def test_settings_reads_machine_auth_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("KINO_AUTH_SERVICE_URL", "http://auth-service:8081")
    monkeypatch.setenv("KINO_AUTH_CLIENT_ID", "agent-service")
    monkeypatch.setenv("KINO_AUTH_CLIENT_SECRET", "test-secret")

    settings = CuratorSettings.from_env()

    assert settings.auth_service_url == "http://auth-service:8081"
    assert settings.auth_client_id == "agent-service"
    assert settings.auth_client_secret == "test-secret"


def test_nvidia_model_rejects_google_provider() -> None:
    settings = CuratorSettings(
        data_service_url=DEFAULT_DATA_SERVICE_URL,
        auth_service_url=DEFAULT_AUTH_SERVICE_URL,
        auth_client_id=DEFAULT_AUTH_CLIENT_ID,
        auth_client_secret=DEFAULT_AUTH_CLIENT_SECRET,
        google_api_key=DEFAULT_GOOGLE_API_KEY,
        model_provider=GOOGLE_GENAI_PROVIDER,
        model_name="moonshotai/kimi-k2.5",
        thinking_level=DEFAULT_THINKING_LEVEL,
        nvidia_api_key="",
    )

    with pytest.raises(ValueError, match="nvidia_nim"):
        CuratorModelFactory(settings).create()


def test_nvidia_model_uses_low_latency_settings() -> None:
    settings = CuratorSettings(
        data_service_url=DEFAULT_DATA_SERVICE_URL,
        auth_service_url=DEFAULT_AUTH_SERVICE_URL,
        auth_client_id=DEFAULT_AUTH_CLIENT_ID,
        auth_client_secret=DEFAULT_AUTH_CLIENT_SECRET,
        google_api_key=DEFAULT_GOOGLE_API_KEY,
        model_provider=NVIDIA_NIM_PROVIDER,
        model_name="z-ai/glm-5.1",
        thinking_level=DEFAULT_THINKING_LEVEL,
        nvidia_api_key="nvapi-test",
    )

    model = CuratorModelFactory(settings).create()

    assert isinstance(model, ChatOpenAI)
    assert model.temperature == 0
    assert model.max_retries == 0
    assert model.request_timeout == 180
    assert model.extra_body == {
        "chat_template_kwargs": {"enable_thinking": False}
    }


def test_google_gemma_model_uses_best_effort_thinking_settings() -> None:
    settings = CuratorSettings(
        data_service_url=DEFAULT_DATA_SERVICE_URL,
        auth_service_url=DEFAULT_AUTH_SERVICE_URL,
        auth_client_id=DEFAULT_AUTH_CLIENT_ID,
        auth_client_secret=DEFAULT_AUTH_CLIENT_SECRET,
        google_api_key="test-google-api-key",
        model_provider=GOOGLE_GENAI_PROVIDER,
        model_name="gemma-4-31b-it",
        thinking_level=DEFAULT_THINKING_LEVEL,
        nvidia_api_key="",
    )

    model = CuratorModelFactory(settings).create()

    assert isinstance(model, ChatGoogleGenerativeAI)
    assert model.model == "gemma-4-31b-it"
    assert model.thinking_level == DEFAULT_THINKING_LEVEL
    assert model.include_thoughts is True
    assert model.temperature == 0.2
