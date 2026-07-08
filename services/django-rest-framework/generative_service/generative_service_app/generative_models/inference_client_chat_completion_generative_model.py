from logging import getLogger

from django.apps import apps
from django.core.exceptions import ImproperlyConfigured
from huggingface_hub import InferenceClient


class InferenceClientChatCompletionGenerativeModel:
    TITLE_FACTS_PROMPT_TEMPLATE = ("List shortly 3 interesting facts "
                                   "about \"{title_name}\" ({title_year}) {title_type}.")

    def __init__(self, model_name, access_token=None):
        self._logger = getLogger(self.__class__.__name__)
        self.model_name = model_name
        self._model_name = self.model_name
        resolved_access_token = access_token
        if resolved_access_token is None:
            resolved_access_token = apps.get_app_config(
                "generative_service_app"
            ).huggingface_hub_access_token
        if resolved_access_token is None or not resolved_access_token.strip():
            raise ImproperlyConfigured(
                "HUGGINGFACE_HUB_ACCESS_TOKEN is required when "
                "GENERATIVE_MODEL_PROVIDER=huggingface_hub."
            )
        resolved_access_token = resolved_access_token.strip()
        self._inference_client = InferenceClient(
            self._model_name,
            token=resolved_access_token,
        )

    def prompt_title_facts(self, title_name, title_year, title_type):
        input_text = self.TITLE_FACTS_PROMPT_TEMPLATE.format(title_name=title_name, title_year=title_year,
                                                             title_type=title_type)

        messages = [
            {"role": "user", "content": input_text},
        ]

        self._logger.warning(f"Generating '{self._model_name}' outputs for title facts prompt...")

        model_response = ""

        for message in self._inference_client.chat_completion(messages=messages, max_tokens=500, stream=True):
            model_response += message.choices[0].delta.content

        return model_response
