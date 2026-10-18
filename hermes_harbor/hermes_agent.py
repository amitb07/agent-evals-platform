"""Harbor installed-agent adapter that runs Hermes Agent in one-shot mode."""

import json
import re
import shlex
import tempfile
from pathlib import Path
from typing import Any

from harbor.agents.installed.base import (
    AgentAuthenticationError,
    ApiInternalServerError,
    ApiOverloadedError,
    ApiRateLimitError,
    BaseInstalledAgent,
    with_prompt_template,
)
from harbor.agents.model_connection import ModelConnectionSpec
from harbor.agents.options import InstalledAgentOptions
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext
from harbor.models.trajectories import (
    Agent,
    FinalMetrics,
    Observation,
    ObservationResult,
    Step,
    ToolCall,
    Trajectory,
)
from pydantic import Field

HERMES_HOME = "/opt/data"
HERMES_USER = "hermes"
WORKDIR = "/app"

PROVIDER_ERRORS: tuple[tuple[re.Pattern[str], type[Exception]], ...] = (
    (re.compile(r"rate.?limit|\b429\b", re.I), ApiRateLimitError),
    (re.compile(r"overloaded|\b529\b", re.I), ApiOverloadedError),
    (re.compile(r"internal server error|\b5\d\d\b", re.I), ApiInternalServerError),
    (re.compile(r"authentication|invalid.*api.?key|\b401\b", re.I), AgentAuthenticationError),
)


class HermesOptions(InstalledAgentOptions):
    arm: str = Field(description="Experiment arm label, A or B.")
    home_bundle: str = Field(description="Local directory uploaded as HERMES_HOME.")
    toolsets: str = Field(description="Comma-separated Hermes toolsets.")
    skills: str = Field(default="", description="Comma-separated skills to preload.")
    max_turns: int = Field(description="Maximum tool-calling iterations.")


class HermesAgent(BaseInstalledAgent):
    options_model = HermesOptions
    MODEL_CONNECTION = ModelConnectionSpec(
        default_provider="anthropic", api_key_envs=("ANTHROPIC_API_KEY",)
    )

    @staticmethod
    def name() -> str:
        return "hermes"

    def get_version_command(self) -> str | None:
        return "hermes --version"

    @property
    def opts(self) -> HermesOptions:
        assert isinstance(self.options, HermesOptions)
        return self.options

    @property
    def remote_logs(self) -> str:
        return self.environment_logs_dir.as_posix()

    def _agent_env(self) -> dict[str, str]:
        env = {
            "HERMES_HOME": HERMES_HOME,
            "HOME": HERMES_HOME,
            "HERMES_WRITE_SAFE_ROOT": WORKDIR,
        }
        if key := self.model_connection.api_key:
            env["ANTHROPIC_API_KEY"] = key
        return env

    def _hermes_command(self) -> str:
        logs = self.remote_logs
        opts = self.opts
        top = [
            "hermes",
            "-m", self._parsed_model_name or "",
            "--provider", "anthropic",
            "-t", opts.toolsets,
            "--yolo",
            "--in", WORKDIR,
        ]
        if opts.skills:
            top += ["--skills", opts.skills]
        chat = [
            "chat",
            "--query-file", f"{logs}/instruction.md",
            "--oneshot",
            "--format", "stream-json",
            "--max-turns", str(opts.max_turns),
        ]
        return (
            f"{shlex.join(top + chat)} > {logs}/events.jsonl 2> {logs}/stderr.txt; "
            f"echo $? > {logs}/exit_code"
        )

    async def install(self, environment: BaseEnvironment) -> None:
        await self.exec_as_agent(environment, "hermes --version")

    @with_prompt_template
    async def run(
        self, instruction: str, environment: BaseEnvironment, context: AgentContext
    ) -> None:
        logs = self.remote_logs
        env = self._agent_env()

        await self.exec_as_root(
            environment,
            f"mkdir -p {HERMES_HOME} {logs} {WORKDIR} && find {HERMES_HOME} -mindepth 1 -delete",
        )
        await environment.upload_dir(self.opts.home_bundle, HERMES_HOME)
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / "instruction.md"
            local.write_text(instruction)
            await environment.upload_file(local, f"{logs}/instruction.md")
        arm = json.dumps({"arm": self.opts.arm, "home_bundle": self.opts.home_bundle})
        await self.exec_as_root(
            environment,
            f"printf %s {shlex.quote(arm)} > {logs}/arm.json && "
            f"chown -R {HERMES_USER}:{HERMES_USER} {HERMES_HOME} {logs} {WORKDIR}",
        )

        await self.exec_as_agent(environment, self._hermes_command(), env=env, cwd=WORKDIR)

        await self.exec_as_agent(
            environment,
            f"find {HERMES_HOME} -type f -newer {logs}/instruction.md > {logs}/home-writes.txt; "
            f"cp {HERMES_HOME}/config.yaml {logs}/effective-config.yaml",
        )
        result = _result_event(await self._download_text(environment, f"{logs}/events.jsonl"))
        if session_id := result.get("session_id"):
            await self.exec_as_agent(
                environment,
                f"hermes sessions export --format jsonl --yes "
                f"--session-id {shlex.quote(str(session_id))} {logs}/session.jsonl",
                env=env,
            )

        exit_code = (await self._download_text(environment, f"{logs}/exit_code")).strip()
        if exit_code != "0":
            stderr = await self._download_text(environment, f"{logs}/stderr.txt")
            for pattern, error in PROVIDER_ERRORS:
                if pattern.search(stderr):
                    raise error(f"Hermes failed: {stderr[-500:]}")

    async def _download_text(self, environment: BaseEnvironment, remote: str) -> str:
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / "f"
            try:
                await environment.download_file(remote, local)
                return local.read_text()
            except Exception:
                return ""

    def populate_context_post_run(self, context: AgentContext) -> None:
        events_path = self.logs_dir / "events.jsonl"
        events_text = events_path.read_text() if events_path.exists() else ""
        result = _result_event(events_text)
        tokens = result.get("tokens") or {}
        if tokens:
            cache_read = int(tokens.get("cache_read") or 0)
            context.n_input_tokens = (
                int(tokens.get("input") or 0) + cache_read + int(tokens.get("cache_write") or 0)
            )
            context.n_cache_tokens = cache_read
            context.n_output_tokens = int(tokens.get("output") or 0)
        session = _session_export(self.logs_dir / "session.jsonl")
        if session.get("estimated_cost_usd") is not None:
            context.cost_usd = float(session["estimated_cost_usd"])
        exit_code_path = self.logs_dir / "exit_code"
        context.metadata = {
            "session_id": result.get("session_id"),
            "hermes_exit_code": result.get("exit_code"),
            "duration_ms": result.get("duration_ms"),
            "tokens": tokens or None,
            "exit_code": exit_code_path.read_text().strip() if exit_code_path.exists() else None,
            "end_reason": session.get("end_reason"),
            "api_call_count": session.get("api_call_count"),
            "cost_status": session.get("cost_status"),
            "cost_source": session.get("cost_source"),
        }
        trajectory = self._trajectory(events_text, result, context)
        if trajectory is not None:
            (self.logs_dir / "trajectory.json").write_text(
                json.dumps(trajectory.to_json_dict(), indent=2, ensure_ascii=False)
            )

    def _trajectory(
        self, events_text: str, result: dict[str, Any], context: AgentContext
    ) -> Trajectory | None:
        if not events_text:
            return None
        instruction_path = self.logs_dir / "instruction.md"
        steps = [
            Step(
                step_id=1,
                source="user",
                message=instruction_path.read_text() if instruction_path.exists() else "",
            )
        ]
        text: list[str] = []
        calls: list[ToolCall] = []
        results: list[ObservationResult] = []

        def flush() -> None:
            if not text and not calls:
                return
            steps.append(
                Step(
                    step_id=len(steps) + 1,
                    source="agent",
                    model_name=self._parsed_model_name,
                    message="".join(text),
                    tool_calls=list(calls) or None,
                    observation=Observation(results=list(results)) if results else None,
                )
            )
            text.clear()
            calls.clear()
            results.clear()

        for event in _events(events_text):
            kind = event.get("type")
            if kind == "text":
                if calls:
                    flush()
                text.append(str(event.get("text") or ""))
            elif kind == "tool_use":
                arguments = event.get("input")
                calls.append(
                    ToolCall(
                        tool_call_id=f"call_{len(steps)}_{len(calls) + 1}",
                        function_name=str(event.get("name") or "unknown"),
                        arguments=arguments if isinstance(arguments, dict) else {"input": arguments},
                    )
                )
            elif kind == "tool_result" and len(results) < len(calls):
                results.append(
                    ObservationResult(
                        source_call_id=calls[len(results)].tool_call_id,
                        content=str(event.get("output") or ""),
                        extra={
                            "name": event.get("name"),
                            "is_error": bool(event.get("is_error")),
                            "duration_ms": event.get("duration_ms"),
                        },
                    )
                )
                if len(results) == len(calls):
                    flush()
        flush()

        return Trajectory(
            schema_version="ATIF-v1.7",
            session_id=result.get("session_id"),
            agent=Agent(
                name=self.name(),
                version=self.version() or "unknown",
                model_name=self._parsed_model_name,
            ),
            steps=steps,
            final_metrics=FinalMetrics(
                total_prompt_tokens=context.n_input_tokens,
                total_completion_tokens=context.n_output_tokens,
                total_cached_tokens=context.n_cache_tokens,
                total_cost_usd=context.cost_usd,
                total_steps=len(steps),
            ),
            extra={"hermes_exit_code": result.get("exit_code"), "duration_ms": result.get("duration_ms")},
        )


def _events(text: str) -> list[dict[str, Any]]:
    events = []
    for line in text.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            events.append(event)
    return events


def _result_event(text: str) -> dict[str, Any]:
    for event in reversed(_events(text)):
        if event.get("type") == "result":
            return event
    return {}


def _session_export(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    for line in path.read_text().splitlines():
        try:
            session = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(session, dict):
            return session
    return {}
