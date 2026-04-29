import os

import pytest

os.environ.setdefault("GOOGLE_API_KEY", "test-google-api-key")


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"
