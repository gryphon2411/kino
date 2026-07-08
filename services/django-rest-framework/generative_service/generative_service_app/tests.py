import os
from importlib import import_module
from unittest.mock import patch

import requests
from django.apps import apps
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from generative_service_app.apps import (
    DEFAULT_GENERATIVE_MODEL_NAME,
    DEFAULT_GENERATIVE_MODEL_PROVIDER,
    GenerativeServiceAppConfig,
)
from generative_service_app.generative_models.factory import (
    create_generative_model,
)
from generative_service_app.generative_models.google_genai import (
    GoogleGenerativeModel,
)
from generative_service_app.generative_models.inference_client_chat_completion_generative_model import \
    InferenceClientChatCompletionGenerativeModel


class GenerativeModelFactoryTests(SimpleTestCase):
    def test_app_config_uses_stable_defaults_when_env_is_absent(self):
        app_config = apps.get_app_config("generative_service_app")

        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                app_config.generative_model_provider,
                DEFAULT_GENERATIVE_MODEL_PROVIDER,
            )
            self.assertEqual(
                app_config.generative_model_name,
                DEFAULT_GENERATIVE_MODEL_NAME,
            )

    def test_google_genai_selects_google_backend(self):
        model = create_generative_model(
            model_provider="google_genai",
            model_name="gemini-3.1-flash-lite",
            google_api_key="test-gemini-key",
        )

        self.assertIsInstance(model, GoogleGenerativeModel)
        self.assertEqual(model.model_name, "gemini-3.1-flash-lite")

    def test_huggingface_phi3_selects_inference_client_backend(self):
        model = create_generative_model(
            model_provider="huggingface_hub",
            model_name="microsoft/Phi-3-mini-4k-instruct",
            huggingface_hub_access_token="test-hf-token",
        )

        self.assertIsInstance(
            model,
            InferenceClientChatCompletionGenerativeModel,
        )
        self.assertEqual(
            model.model_name,
            "microsoft/Phi-3-mini-4k-instruct",
        )

    def test_huggingface_mixtral_selects_inference_client_backend(self):
        model = create_generative_model(
            model_provider="huggingface_hub",
            model_name="mistralai/Mixtral-8x7B-Instruct-v0.1",
            huggingface_hub_access_token="test-hf-token",
        )

        self.assertIsInstance(
            model,
            InferenceClientChatCompletionGenerativeModel,
        )
        self.assertEqual(
            model.model_name,
            "mistralai/Mixtral-8x7B-Instruct-v0.1",
        )

    def test_legacy_gemini_alias_resolves_to_google_backend(self):
        model = create_generative_model(
            model_provider="google_genai",
            model_name="gemini2flash",
            google_api_key="test-gemini-key",
        )

        self.assertIsInstance(model, GoogleGenerativeModel)
        self.assertEqual(model.model_name, "gemini-2.0-flash")

    def test_legacy_phi3_alias_resolves_to_huggingface_backend(self):
        model = create_generative_model(
            model_provider="huggingface_hub",
            model_name="phi3",
            huggingface_hub_access_token="test-hf-token",
        )

        self.assertIsInstance(
            model,
            InferenceClientChatCompletionGenerativeModel,
        )
        self.assertEqual(
            model.model_name,
            "microsoft/Phi-3-mini-4k-instruct",
        )

    def test_legacy_mixtral_alias_resolves_to_huggingface_backend(self):
        model = create_generative_model(
            model_provider="huggingface_hub",
            model_name="mixtral8x7b",
            huggingface_hub_access_token="test-hf-token",
        )

        self.assertIsInstance(
            model,
            InferenceClientChatCompletionGenerativeModel,
        )
        self.assertEqual(
            model.model_name,
            "mistralai/Mixtral-8x7B-Instruct-v0.1",
        )

    def test_unsupported_provider_raises_configuration_error(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured,
            "GENERATIVE_MODEL_PROVIDER must be 'google_genai' or 'huggingface_hub'.",
        ):
            create_generative_model(
                model_provider="invalid-provider",
                model_name="gemini-3.1-flash-lite",
            )

    def test_missing_model_name_raises_configuration_error(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured,
            "GENERATIVE_MODEL_NAME is required.",
        ):
            create_generative_model(
                model_provider="google_genai",
                model_name="   ",
            )

    def test_missing_provider_raises_configuration_error(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured,
            "GENERATIVE_MODEL_PROVIDER is required.",
        ):
            create_generative_model(
                model_provider=None,
                model_name="gemini-3.1-flash-lite",
            )

    def test_legacy_alias_rejects_mismatched_provider(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured,
            "gemini2flash requires provider google_genai, not huggingface_hub.",
        ):
            create_generative_model(
                model_provider="huggingface_hub",
                model_name="gemini2flash",
            )

    def test_google_provider_requires_gemini_api_key(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured,
            "GEMINI_API_KEY is required when GENERATIVE_MODEL_PROVIDER=google_genai.",
        ):
            create_generative_model(
                model_provider="google_genai",
                model_name="gemini-3.1-flash-lite",
                google_api_key="   ",
            )

    def test_huggingface_provider_requires_access_token(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured,
            "HUGGINGFACE_HUB_ACCESS_TOKEN is required when GENERATIVE_MODEL_PROVIDER=huggingface_hub.",
        ):
            create_generative_model(
                model_provider="huggingface_hub",
                model_name="microsoft/Phi-3-mini-4k-instruct",
                huggingface_hub_access_token="",
            )

    def test_google_provider_rejects_huggingface_style_model_id(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured,
            "microsoft/Phi-3-mini-4k-instruct is not compatible with provider google_genai.",
        ):
            create_generative_model(
                model_provider="google_genai",
                model_name="microsoft/Phi-3-mini-4k-instruct",
                google_api_key="test-gemini-key",
            )

    def test_huggingface_provider_rejects_google_style_model_id(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured,
            "gemini-3.1-flash-lite is not compatible with provider huggingface_hub.",
        ):
            create_generative_model(
                model_provider="huggingface_hub",
                model_name="gemini-3.1-flash-lite",
                huggingface_hub_access_token="test-hf-token",
            )

    def test_google_provider_rejects_unknown_google_model_id(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured,
            "gemini-3.1-flsh-lite is not a supported google_genai model.",
        ):
            create_generative_model(
                model_provider="google_genai",
                model_name="gemini-3.1-flsh-lite",
                google_api_key="test-gemini-key",
            )

    def test_huggingface_provider_rejects_unknown_huggingface_model_id(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured,
            "microsoft/Does-Not-Exist is not a supported huggingface_hub model.",
        ):
            create_generative_model(
                model_provider="huggingface_hub",
                model_name="microsoft/Does-Not-Exist",
                huggingface_hub_access_token="test-hf-token",
            )


class GenerativeServiceAppConfigTests(SimpleTestCase):
    def test_ready_initializes_active_generative_model(self):
        app_config = GenerativeServiceAppConfig(
            "generative_service_app",
            import_module("generative_service_app"),
        )
        initialized_model = object()

        with patch.dict(
            os.environ,
            {
                "GENERATIVE_MODEL_PROVIDER": "google_genai",
                "GENERATIVE_MODEL_NAME": "gemini-3.1-flash-lite",
                "GEMINI_API_KEY": "test-gemini-key",
            },
            clear=True,
        ):
            with patch(
                "generative_service_app.generative_models.factory.create_generative_model",
                return_value=initialized_model,
            ) as create_model:
                app_config.ready()

        self.assertIs(app_config.active_generative_model, initialized_model)
        create_model.assert_called_once_with(
            model_provider="google_genai",
            model_name="gemini-3.1-flash-lite",
            google_api_key="test-gemini-key",
            huggingface_hub_access_token=None,
        )

    def test_ready_fails_fast_when_default_google_secret_is_missing(self):
        app_config = GenerativeServiceAppConfig(
            "generative_service_app",
            import_module("generative_service_app"),
        )

        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesMessage(
                ImproperlyConfigured,
                "GEMINI_API_KEY is required when GENERATIVE_MODEL_PROVIDER=google_genai.",
            ):
                app_config.ready()


class GoogleGenerativeModelTests(SimpleTestCase):
    def test_http_error_log_does_not_include_google_api_key(self):
        model = GoogleGenerativeModel(
            model_name="gemini-3.1-flash-lite",
            api_key="test-secret-api-key",
        )
        mock_response = requests.Response()
        mock_response.status_code = 500
        mock_response.reason = "Internal Server Error"
        mock_response.url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            "gemini-3.1-flash-lite:generateContent?key=test-secret-api-key"
        )
        http_error = requests.HTTPError(response=mock_response)

        with patch(
            "generative_service_app.generative_models.google_genai.requests.post",
        ) as post:
            post.return_value.raise_for_status.side_effect = http_error

            with self.assertLogs("GoogleGenerativeModel", level="ERROR") as captured:
                response = model.prompt_title_facts("Carmencita", 1894, "short")

        self.assertEqual(response, "Try again later...")
        joined_logs = "\n".join(captured.output)
        self.assertNotIn("test-secret-api-key", joined_logs)
        self.assertIn("HTTP 500 Internal Server Error", joined_logs)
