# Django REST Framework Generative Service

## Setup

```bash
$ basename $(pwd)
django-rest-framework

$ mkdir generative_service

# Open generative_service with PyCharm and python3.10 virtual environment

(venv) $ pip install uwsgi django djangorestframework requests huggingface_hub pika
(venv) $ django-admin startproject generative_service .
(venv) $ django-admin startapp generative_service_app
```

## Setup (Obsolete)

```bash
$ basename $(pwd)
django-rest-framework

$ mkdir generative_service

# Open generative_service with PyCharm and python3.10 virtual environment

(venv) $ pip install django djangorestframework transformers pip tensorflow
(venv) $ pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
(venv) $ django-admin startproject generative_service .
(venv) $ django-admin startapp generative_service_app
```

### Gemma

Gemma is provided under and subject to the Gemma Terms of Use found at [ai.google.dev/gemma/terms](ai.google.dev/gemma/terms).

#### Use Restrictions

You must not use any of the Gemma Services:

1. for the restricted uses set forth in the Gemma Prohibited Use Policy at [ai.google.dev/gemma/prohibited_use_policy](ai.google.dev/gemma/prohibited_use_policy) (“Prohibited Use Policy”), which is hereby incorporated by reference into this Agreement; or 
2. in violation of applicable laws and regulations.

To the maximum extent permitted by law, Google reserves the right to restrict (remotely or otherwise) usage of any of the Gemma Services that Google reasonably believes are in violation of this Agreement.

## Runtime Model Selection

The current generative runtime contract is explicit provider plus model:

- `GENERATIVE_MODEL_PROVIDER`
- `GENERATIVE_MODEL_NAME`

The default provider is `google_genai` and the default model is
`gemini-3.1-flash-lite`.

Provider and model must be compatible, and the current supported upstream
model ids are explicit:

- `google_genai` supports `gemini-3.1-flash-lite` and `gemini-2.0-flash`
- `huggingface_hub` supports `microsoft/Phi-3-mini-4k-instruct` and `mistralai/Mixtral-8x7B-Instruct-v0.1`

Example local shell for Django commands:

```bash
export GENERATIVE_MODEL_PROVIDER=google_genai
export GENERATIVE_MODEL_NAME=gemini-3.1-flash-lite
export GEMINI_API_KEY=dummy-local-key
```

Provider-specific secrets:

- `google_genai` requires `GEMINI_API_KEY`
- `huggingface_hub` requires `HUGGINGFACE_HUB_ACCESS_TOKEN`

Invalid provider, blank model, or unsupported model configuration now fails at
Django startup instead of surfacing later on the first request.

The old selector aliases `gemini2flash`, `phi3`, and `mixtral8x7b` remain as
one-transition compatibility shims inside the selector layer, but they are
deprecated and should not be used for new deploy inputs.
