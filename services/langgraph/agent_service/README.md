# Kino Agent Service

LangGraph-based agent service for Kino. The first workflow is **Kino Discover**:
a small `create_agent` tool-calling title discovery agent that turns fuzzy taste
requests into structured title discoveries.

## Development

```bash
cd services/langgraph/agent_service
pip install -e ".[dev]"
langgraph dev --no-browser
```

The local LangGraph server listens on `http://127.0.0.1:2024` by default.

Example local invocation payload:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "I want a short non-adult thriller from the 90s, but not too obvious."
    }
  ]
}
```

Kino Discover uses LangChain's `create_agent`, which builds a LangGraph runtime
for the model/tool loop. The model decides when to call the `search_titles` tool.
The tool uses the internal data-service search endpoint and authenticates with
short-lived JWT machine tokens from auth-service when
`KINO_DATA_SERVICE_URL` and the machine-auth settings are configured.

Enable Gemini for real tool-calling runs:

```bash
export KINO_CURATOR_PROVIDER=google_genai
export KINO_CURATOR_MODEL=gemini-3.1-flash-lite-preview
export KINO_CURATOR_THINKING_LEVEL=high
export GOOGLE_API_KEY=...
export KINO_AUTH_SERVICE_URL=http://localhost:8081/api/v1/auth
export KINO_AUTH_CLIENT_ID=agent-service
export KINO_AUTH_CLIENT_SECRET=...
```

Use NVIDIA NIM through LangChain's `ChatNVIDIA` integration:

```bash
export KINO_CURATOR_PROVIDER=nvidia_nim
export KINO_CURATOR_MODEL=deepseek-ai/deepseek-v3.2
export NVIDIA_API_KEY=...
```

`moonshotai/kimi-k2.5` is also supported through the same provider. The service
uses ChatNVIDIA's hosted NVIDIA API endpoint.

Tests do not invoke the LLM provider, so they do not spend free-tier quota.

## Validation

```bash
langgraph validate
python -m pytest tests/unit_tests
python -m pytest tests/integration_tests
```

## Standalone Image

The project image runs the in-memory LangGraph development server:

```bash
docker build -t gryphon2411/kino-agent_service:latest .
docker run --rm -p 2024:2024 \
  -e KINO_CURATOR_PROVIDER=nvidia_nim \
  -e KINO_CURATOR_MODEL=deepseek-ai/deepseek-v3.2 \
  -e NVIDIA_API_KEY=... \
  -e KINO_AUTH_SERVICE_URL=http://host.docker.internal:8081/api/v1/auth \
  -e KINO_AUTH_CLIENT_ID=agent-service \
  -e KINO_AUTH_CLIENT_SECRET=... \
  gryphon2411/kino-agent_service:latest
```

The image command is `langgraph dev --host 0.0.0.0 --port 2024 --no-browser
--no-reload`. It intentionally does not use `langgraph build`, Redis, Postgres,
LangSmith, or a LangGraph license key.

## Deployment Notes

When enabled in Terraform, Kubernetes deploys this same dev-server image
behind `/api/v1/agent` with `MOUNT_PREFIX=/api/v1/agent`. This is acceptable
for the current educational, non-commercial cluster, but it is still the
in-memory development runtime. Threads/runs are not durable across pod
restarts.

The official standalone Agent Server image from `langgraph build` requires
Redis, Postgres, `LANGSMITH_API_KEY`, and `LANGGRAPH_CLOUD_LICENSE_KEY` at
runtime. Switch to that path only if those credentials become available.

The internal auth path assumes auth-service signs machine JWTs with a stable
RSA key. In the Kubernetes/Terraform flow, that key is generated once by
Terraform and mounted into auth-service from a Kubernetes secret.
