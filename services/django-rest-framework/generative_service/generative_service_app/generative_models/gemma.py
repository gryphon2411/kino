import re
from logging import getLogger
from typing import Optional

from django.apps import apps
from transformers import AutoTokenizer, AutoModelForCausalLM

logger = getLogger(__name__)
gemma_generative_model = None  # type: Optional[GemmaGenerativeModel]


def get_gemma_generative_model():
    global gemma_generative_model

    if not gemma_generative_model:
        gemma_generative_model = GemmaGenerativeModel()

    return gemma_generative_model


class GemmaGenerativeModel:
    ACCESS_TOKEN = apps.get_app_config("generative_service_app").huggingface_hub_access_token
    MODEL_NAME = "google/gemma-2b-it"
    TITLE_FACTS_PROMPT_TEMPLATE = "List 3 fun facts about \"{title_name}\" ({title_year})."

    def __init__(self):
        logger.warning(f"Instantiating '{self.MODEL_NAME}' tokenizer...")
        self.tokenizer = AutoTokenizer.from_pretrained(self.MODEL_NAME, token=self.ACCESS_TOKEN)
        logger.warning(f"Instantiating '{self.MODEL_NAME}' model...")
        self.model = AutoModelForCausalLM.from_pretrained(self.MODEL_NAME, token=self.ACCESS_TOKEN)

    def prompt_title_facts(self, title_name, title_year):
        input_ids = self.__get_model_input_ids(title_name, title_year)

        logger.warning(f"Generating '{self.MODEL_NAME}' outputs for title facts prompt...")
        outputs = self.model.generate(input_ids=input_ids.to(self.model.device), max_new_tokens=150)

        return self._get_model_response(outputs)

    def __get_model_input_ids(self, title_name, title_year):
        input_text = self.TITLE_FACTS_PROMPT_TEMPLATE.format(title_name=title_name, title_year=title_year)
        chat = [{"role": "user", "content": input_text}]
        prompt = self.tokenizer.apply_chat_template(chat, tokenize=False, add_generation_prompt=True)

        input_ids = self.tokenizer.encode(prompt, add_special_tokens=False, return_tensors="pt")

        return input_ids

    def _get_model_response(self, outputs):
        decoded_sentence = self.tokenizer.decode(outputs[0])

        match = re.search(r'<start_of_turn>model(?P<response>.*?)<eos>', decoded_sentence, re.DOTALL)

        if not match:
            return None

        extracted_text = match.group('response')
        cleaned_text = re.sub(r'\n+', '\n', extracted_text).strip()

        return cleaned_text
