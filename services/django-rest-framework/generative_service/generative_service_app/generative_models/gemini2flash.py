from typing import Optional

from generative_service_app.generative_models.google_genai import (
    GoogleGenerativeModel,
)


gemini2flash_generative_model = None  # type: Optional[Gemini2FlashGenerativeModel]


def get_gemini2flash_generative_model():
    global gemini2flash_generative_model

    if not gemini2flash_generative_model:
        gemini2flash_generative_model = Gemini2FlashGenerativeModel()

    return gemini2flash_generative_model


class Gemini2FlashGenerativeModel:
    MODEL_NAME = "gemini-2.0-flash"

    def __new__(cls):
        return GoogleGenerativeModel(cls.MODEL_NAME)
