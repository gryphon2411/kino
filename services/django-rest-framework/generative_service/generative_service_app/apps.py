import os
from typing import Any

from django.apps import AppConfig
from django.core.exceptions import ImproperlyConfigured

DEFAULT_GENERATIVE_MODEL_PROVIDER = "google_genai"
DEFAULT_GENERATIVE_MODEL_NAME = "gemini-3.1-flash-lite"


class GenerativeServiceAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'generative_service_app'
    _active_generative_model: Any | None = None

    @property
    def huggingface_hub_access_token(self) -> str | None:
        return os.getenv("HUGGINGFACE_HUB_ACCESS_TOKEN")

    @property
    def gemini_api_key(self) -> str | None:
        return os.getenv("GEMINI_API_KEY")

    @property
    def generative_model_provider(self) -> str | None:
        return os.getenv(
            "GENERATIVE_MODEL_PROVIDER",
            DEFAULT_GENERATIVE_MODEL_PROVIDER,
        )

    @property
    def generative_model_name(self) -> str | None:
        return os.getenv(
            "GENERATIVE_MODEL_NAME",
            DEFAULT_GENERATIVE_MODEL_NAME,
        )

    @property
    def rabbitmq_username(self) -> str | None:
        return os.getenv("RABBITMQ_USERNAME")

    @property
    def rabbitmq_password(self) -> str | None:
        return os.getenv("RABBITMQ_PASSWORD")

    @property
    def rabbitmq_host_address(self) -> str | None:
        return os.getenv("RABBITMQ_HOST_ADDRESS")

    @property
    def rabbitmq_host_port(self) -> str | None:
        return os.getenv("RABBITMQ_HOST_PORT")

    @property
    def rabbitmq_vhost(self) -> str | None:
        return os.getenv("RABBITMQ_VHOST")

    @property
    def active_generative_model(self) -> Any:
        if self._active_generative_model is None:
            raise ImproperlyConfigured(
                "Generative model configuration has not been initialized."
            )

        return self._active_generative_model

    def ready(self) -> None:
        from generative_service_app.generative_models.factory import (
            create_generative_model,
        )

        self._active_generative_model = create_generative_model(
            model_provider=self.generative_model_provider,
            model_name=self.generative_model_name,
            google_api_key=self.gemini_api_key,
            huggingface_hub_access_token=self.huggingface_hub_access_token,
        )
