from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

from ..commons import run_command
from .definitions import (
    ACTIVE_TITLE_COLLECTION,
    DEFAULT_MONGO_IMAGE,
    DEFAULT_MONGO_READY_TIMEOUT_SECONDS,
    DEFAULT_MONGO_WAIT_TIMEOUT_SECONDS,
    MONGO_DATABASE_NAME,
    STAGING_TITLE_COLLECTION,
)

MONGO_PING_EVAL_SCRIPT = r"db.adminCommand({ping: 1}).ok"


def build_mongo_uri() -> str:
    uri_format = os.getenv("MONGO_URI_FORMAT", "mongodb")
    host = os.getenv("MONGO_HOST", "localhost:27017")
    username = os.getenv("MONGO_USERNAME")
    password = os.getenv("MONGO_PASSWORD")
    auth_db = os.getenv("MONGO_AUTH_DB", "admin")
    if username and password:
        return f"{uri_format}://{username}:{password}@{host}/{auth_db}?authSource={auth_db}"
    return f"{uri_format}://{host}/"


class TemporaryMongoContainer:
    def __init__(self, work_dir: Path, *, mongo_image: str = DEFAULT_MONGO_IMAGE) -> None:
        self.work_dir = work_dir
        self.mongo_image = mongo_image
        self.container_name = f"kino-seed-{uuid.uuid4().hex[:8]}"

    def __enter__(self) -> "TemporaryMongoContainer":
        docker_run_command = [
            "docker",
            "run",
            "-d",
            "--rm",
            "-v",
            f"{self.work_dir}:/work",
            "--name",
            self.container_name,
            self.mongo_image,
            "--bind_ip_all",
        ]
        run_command(docker_run_command)
        self.wait_until_ready()
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        docker_stop_command = ["docker", "stop", self.container_name]
        subprocess.run(
            docker_stop_command,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def exec(self, *args: str) -> subprocess.CompletedProcess[str]:
        return run_command(["docker", "exec", self.container_name, *args])

    def wait_until_ready(
        self,
        timeout_seconds: int = DEFAULT_MONGO_READY_TIMEOUT_SECONDS,
    ) -> None:
        wait_for_mongo_container(self.container_name, timeout_seconds=timeout_seconds)


def wait_for_mongo_container(
    container_name: str,
    timeout_seconds: int = DEFAULT_MONGO_READY_TIMEOUT_SECONDS,
) -> None:
    timeout_at = time.monotonic() + timeout_seconds
    docker_ping_command = [
        "docker",
        "exec",
        container_name,
        "mongosh",
        "--quiet",
        "--eval",
        MONGO_PING_EVAL_SCRIPT,
    ]
    while time.monotonic() < timeout_at:
        try:
            result = run_command(docker_ping_command)
            if result.stdout.strip() == "1":
                return
        except subprocess.CalledProcessError:
            pass
        time.sleep(1)
    raise TimeoutError(f"Timed out waiting for Mongo container {container_name}")


class MongoToolsRuntime:
    def __init__(
        self,
        *,
        docker_network: str | None = None,
        mongo_image: str = DEFAULT_MONGO_IMAGE,
    ) -> None:
        self.docker_network = docker_network
        self.mongo_image = mongo_image

    def wait_for_endpoint(
        self,
        *,
        mongo_uri: str,
        timeout_seconds: int = DEFAULT_MONGO_WAIT_TIMEOUT_SECONDS,
    ) -> None:
        timeout_at = time.monotonic() + timeout_seconds
        while time.monotonic() < timeout_at:
            try:
                result = self.run_mongosh(mongo_uri, MONGO_PING_EVAL_SCRIPT)
                if result.stdout.strip() == "1":
                    return
            except Exception:
                pass
            time.sleep(1)
        raise TimeoutError(f"Timed out waiting for Mongo at {mongo_uri}")

    def run_mongosh(
        self,
        mongo_uri: str,
        eval_script: str,
    ) -> Any:
        if self.docker_network is None and shutil.which("mongosh"):
            return run_command(["mongosh", mongo_uri, "--quiet", "--eval", eval_script])

        if not shutil.which("docker"):
            raise RuntimeError("mongosh is not installed and docker is unavailable.")

        docker_command = ["docker", "run", "--rm"]
        if self.docker_network:
            docker_command.extend(["--network", self.docker_network])
        else:
            docker_command.extend(["--network", "host"])
        mongosh_eval_command = [
            self.mongo_image,
            "mongosh",
            mongo_uri,
            "--quiet",
            "--eval",
            eval_script,
        ]
        docker_command.extend(mongosh_eval_command)
        return run_command(docker_command)

    def run_mongosh_file(
        self,
        mongo_uri: str,
        *,
        script_path: Path,
        script_env: dict[str, str],
    ) -> Any:
        command = [
            "mongosh",
            mongo_uri,
            "--quiet",
            "--file",
            str(script_path),
        ]
        merged_env = os.environ.copy()
        merged_env.update(script_env)

        if self.docker_network is None and shutil.which("mongosh"):
            return run_command(command, env=merged_env)

        if not shutil.which("docker"):
            raise RuntimeError("mongosh is not installed and docker is unavailable.")

        manifest_host_path = Path(script_env["KINO_MANIFEST_PATH"]).resolve()
        with tempfile.TemporaryDirectory(prefix="kino-mongosh-script-") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            docker_script_path = temp_dir / script_path.name
            docker_manifest_path = temp_dir / manifest_host_path.name
            shutil.copy(script_path, docker_script_path)
            shutil.copy(manifest_host_path, docker_manifest_path)
            temp_dir.chmod(0o755)
            docker_script_path.chmod(0o644)
            docker_manifest_path.chmod(0o644)

            docker_env = dict(script_env)
            docker_env["KINO_MANIFEST_PATH"] = f"/work/{docker_manifest_path.name}"

            docker_command = ["docker", "run", "--rm"]
            if self.docker_network:
                docker_command.extend(["--network", self.docker_network])
            else:
                docker_command.extend(["--network", "host"])
            for key, value in docker_env.items():
                docker_command.extend(["-e", f"{key}={value}"])
            mongosh_file_command = [
                "-v",
                f"{temp_dir}:/work:ro",
                self.mongo_image,
                "mongosh",
                mongo_uri,
                "--quiet",
                "--file",
                f"/work/{docker_script_path.name}",
            ]
            docker_command.extend(mongosh_file_command)
            return run_command(docker_command)

    def run_mongorestore(
        self,
        *,
        mongo_uri: str,
        archive_path: Path,
        workers: int,
    ) -> Any:
        base_command = [
            "mongorestore",
            f"--uri={mongo_uri}",
            f"--archive={archive_path}",
            "--gzip",
            "--drop",
            "--stopOnError",
            f"--nsInclude={MONGO_DATABASE_NAME}.{ACTIVE_TITLE_COLLECTION}",
            f"--nsFrom={MONGO_DATABASE_NAME}.{ACTIVE_TITLE_COLLECTION}",
            f"--nsTo={MONGO_DATABASE_NAME}.{STAGING_TITLE_COLLECTION}",
            f"--numInsertionWorkersPerCollection={workers}",
        ]

        if self.docker_network is None and shutil.which("mongorestore"):
            return run_command(base_command)

        if not shutil.which("docker"):
            raise RuntimeError(
                "mongorestore is not installed and docker is unavailable for the fallback restore path."
            )

        docker_command = ["docker", "run", "--rm"]
        if self.docker_network:
            docker_command.extend(["--network", self.docker_network])
        else:
            docker_command.extend(["--network", "host"])
        docker_mongorestore_command = [
            "-v",
            f"{archive_path.parent}:/seed",
            self.mongo_image,
            "mongorestore",
            f"--uri={mongo_uri}",
            f"--archive=/seed/{archive_path.name}",
            "--gzip",
            "--drop",
            "--stopOnError",
            f"--nsInclude={MONGO_DATABASE_NAME}.{ACTIVE_TITLE_COLLECTION}",
            f"--nsFrom={MONGO_DATABASE_NAME}.{ACTIVE_TITLE_COLLECTION}",
            f"--nsTo={MONGO_DATABASE_NAME}.{STAGING_TITLE_COLLECTION}",
            f"--numInsertionWorkersPerCollection={workers}",
        ]
        docker_command.extend(docker_mongorestore_command)
        return run_command(docker_command)
