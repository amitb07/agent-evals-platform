"""No-model Harbor agent for tests: writes the expected file and probes network policy."""

from harbor.agents.installed.base import BaseInstalledAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

PROBE = (
    "cd /app && printf 'Hello, Hermes!\\n' > hello.txt; "
    "for host in api.anthropic.com example.com; do "
    "code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' https://$host/ || echo blocked); "
    "echo \"$host $code\"; done > /logs/agent/network-probe.txt"
)


class FakeAgent(BaseInstalledAgent):
    @staticmethod
    def name() -> str:
        return "fake"

    def version(self) -> str:
        return "1.0.0"

    async def install(self, environment: BaseEnvironment) -> None:
        pass

    async def run(
        self, instruction: str, environment: BaseEnvironment, context: AgentContext
    ) -> None:
        await self.exec_as_root(environment, "mkdir -p /logs/agent && chown -R hermes:hermes /logs/agent /app")
        await self.exec_as_agent(environment, PROBE)
