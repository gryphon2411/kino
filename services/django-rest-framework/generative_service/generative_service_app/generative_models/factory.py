from django.core.exceptions import ImproperlyConfigured

from generative_service_app.generative_models.google_genai import (
    GoogleGenerativeModel,
)
from generative_service_app.generative_models.inference_client_chat_completion_generative_model import \
    InferenceClientChatCompletionGenerativeModel

GOOGLE_GENAI_PROVIDER = "google_genai"
HUGGINGFACE_HUB_PROVIDER = "huggingface_hub"

LEGACY_MODEL_ALIASES = {
    "gemini2flash": (GOOGLE_GENAI_PROVIDER, "gemini-2.0-flash"),
    "phi3": (
        HUGGINGFACE_HUB_PROVIDER,
        "microsoft/Phi-3-mini-4k-instruct",
    ),
    "mixtral8x7b": (
        HUGGINGFACE_HUB_PROVIDER,
        "mistralai/Mixtral-8x7B-Instruct-v0.1",
    ),
}


def create_generative_model(
    model_provider,
    model_name,
    google_api_key=None,
    huggingface_hub_access_token=None,
):
    normalized_provider, normalized_model_name = resolve_model_selection(
        model_provider,
        model_name,
    )

    if normalized_provider == GOOGLE_GENAI_PROVIDER:
        return GoogleGenerativeModel(
            normalized_model_name,
            api_key=google_api_key,
        )

    return InferenceClientChatCompletionGenerativeModel(
        normalized_model_name,
        access_token=huggingface_hub_access_token,
    )


def resolve_model_selection(model_provider, model_name):
    normalized_provider = normalize_model_provider(model_provider)
    normalized_model_name = normalize_model_name(model_name)

    legacy_selection = LEGACY_MODEL_ALIASES.get(normalized_model_name)
    if legacy_selection:
        legacy_provider, legacy_model_name = legacy_selection
        if normalized_provider and normalized_provider != legacy_provider:
            raise ImproperlyConfigured(
                f"{normalized_model_name} requires provider "
                f"{legacy_provider}, not {normalized_provider}."
            )
        return legacy_provider, legacy_model_name

    if not normalized_provider:
        raise ImproperlyConfigured("GENERATIVE_MODEL_PROVIDER is required.")

    if normalized_provider not in {
        GOOGLE_GENAI_PROVIDER,
        HUGGINGFACE_HUB_PROVIDER,
    }:
        raise ImproperlyConfigured(
            "GENERATIVE_MODEL_PROVIDER must be "
            "'google_genai' or 'huggingface_hub'."
        )

    if not normalized_model_name:
        raise ImproperlyConfigured("GENERATIVE_MODEL_NAME is required.")

    validate_model_provider_compatibility(
        normalized_provider,
        normalized_model_name,
    )

    return normalized_provider, normalized_model_name


def normalize_model_name(model_name):
    if model_name is None:
        return ""

    return model_name.strip()


def normalize_model_provider(model_provider):
    if model_provider is None:
        return ""

    return model_provider.strip().lower()


def validate_model_provider_compatibility(model_provider, model_name):
    if model_provider == GOOGLE_GENAI_PROVIDER and "/" in model_name:
        raise ImproperlyConfigured(
            f"{model_name} is not compatible with provider "
            f"{GOOGLE_GENAI_PROVIDER}. Use an upstream Google model id such as "
            "gemini-3.1-flash-lite."
        )

    if model_provider == HUGGINGFACE_HUB_PROVIDER and "/" not in model_name:
        raise ImproperlyConfigured(
            f"{model_name} is not compatible with provider "
            f"{HUGGINGFACE_HUB_PROVIDER}. Use a Hugging Face model id such as "
            "microsoft/Phi-3-mini-4k-instruct."
        )
