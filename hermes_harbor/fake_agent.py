"""No-model Harbor agent for the end-to-end test.

Takes the same kwargs as ``HermesAgent`` and prepares ``HERMES_HOME`` the same way, but instead of
calling an LLM it runs the first ```sh fenced block in the task instruction inside ``/app``. That
exercises the whole pipeline (job config, task image, home bundle upload, separate verifier,
grader, ingestion) without an API key.
"""

import json
import re
import shlex
import tempfile
from pathlib import Path

from harbor.agents.installed.base import BaseInstalledAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

from hermes_harbor.hermes_agent import HERMES_HOME, HERMES_USER, WORKDIR, HermesOptions

SCRIPT = re.compile(r"```sh\n(.*?)```", re.S)


class FakeAgent(BaseInstalledAgent):
    options_model = HermesOptions

    @staticmethod
    def name() -> str:
        return "fake"

    def version(self) -> str:
        return "1.0.0"

    @property
    def opts(self) -> HermesOptions:
        assert isinstance(self.options, HermesOptions)
        return self.options

    async def install(self, environment: BaseEnvironment) -> None:
        pass

    async def run(
        self, instruction: str, environment: BaseEnvironment, context: AgentContext
    ) -> None:
        logs = self.environment_logs_dir.as_posix()
        match = SCRIPT.search(instruction)
        script = match.group(1) if match else "true\n"

        await self.exec_as_root(
            environment,
            f"mkdir -p {HERMES_HOME} {logs} && find {HERMES_HOME} -mindepth 1 -delete",
        )
        await environment.upload_dir(self.opts.home_bundle, HERMES_HOME)
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / "fake-script.sh"
            local.write_text(script)
            await environment.upload_file(local, f"{logs}/fake-script.sh")
        arm = json.dumps({"arm": self.opts.arm, "home_bundle": self.opts.home_bundle})
        await self.exec_as_root(
            environment,
            f"printf %s {shlex.quote(arm)} > {logs}/arm.json && "
            f"chown -R {HERMES_USER}:{HERMES_USER} {HERMES_HOME} {logs} {WORKDIR}",
        )
        await self.exec_as_agent(
            environment,
            f"cd {WORKDIR} && bash {logs}/fake-script.sh > {logs}/stderr.txt 2>&1; "
            f"echo $? > {logs}/exit_code; ls -A {HERMES_HOME} > {logs}/home-listing.txt",
        )

    def populate_context_post_run(self, context: AgentContext) -> None:
        exit_code = self.logs_dir / "exit_code"
        context.cost_usd = 0.0
        context.n_input_tokens = 0
        context.n_output_tokens = 0
        context.metadata = {
            "exit_code": exit_code.read_text().strip() if exit_code.exists() else None,
            "end_reason": "fake_agent",
        }
