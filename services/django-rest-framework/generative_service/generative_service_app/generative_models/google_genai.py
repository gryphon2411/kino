import logging

import requests
from django.apps import apps
from django.core.exceptions import ImproperlyConfigured


class GoogleGenerativeModel:
    API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
    API_HEADERS = {"Content-Type": "application/json"}
    TITLE_FACTS_SYSTEM_INSTRUCTION = "When listing facts, present the facts without introductory or concluding sentences."
    TITLE_FACTS_PROMPT_TEMPLATE = "List 3 interesting facts about \"{title_name}\" ({title_year}) {title_type}."

    def __init__(self, model_name, api_key=None):
        self._logger = logging.getLogger(self.__class__.__name__)
        self.model_name = model_name
        resolved_api_key = api_key
        if resolved_api_key is None:
            resolved_api_key = apps.get_app_config(
                "generative_service_app"
            ).gemini_api_key
        if resolved_api_key is None or not resolved_api_key.strip():
            raise ImproperlyConfigured(
                "GEMINI_API_KEY is required when "
                "GENERATIVE_MODEL_PROVIDER=google_genai."
            )
        resolved_api_key = resolved_api_key.strip()
        self._api_url = (
            f"{self.API_BASE_URL}/{self.model_name}:generateContent"
            f"?key={resolved_api_key}"
        )

    def prompt_title_facts(self, title_name, title_year, title_type):
        input_text = self.TITLE_FACTS_PROMPT_TEMPLATE.format(
            title_name=title_name,
            title_year=title_year,
            title_type=title_type,
        )

        data = {
            "system_instruction": {
                "parts": {
                    "text": self.TITLE_FACTS_SYSTEM_INSTRUCTION
                }
            },
            "contents": {
                "parts": {
                    "text": input_text
                }
            }
        }

        self._logger.warning(
            f"Generating '{self.model_name}' outputs for title facts prompt..."
        )

        model_response = "Try again later..."

        try:
            response = requests.post(
                self._api_url,
                headers=self.API_HEADERS,
                json=data,
            )
            response.raise_for_status()
            response_json = response.json()

            model_response = response_json["candidates"][0]["content"]["parts"][0]["text"]
        except Exception:
            self._logger.exception(
                f"Failed to request title facts for \"{title_name}\" "
                f"({title_year}) {title_type}"
            )

        return model_response
