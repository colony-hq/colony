"""
Agent runtime for Colony.

When a user installs an agent, this system runs it.

Flow:
1. User installs agent → agent config stored in DB
2. User sends message to agent → runtime executes
3. Runtime: load agent config → call LLM → return response

Each agent runs in isolation with its own:
- System prompt
- Model config
- Tools
- Memory (conversation history)
"""

import time
import httpx
import json
from dataclasses import dataclass, field


# Provider configs
PROVIDERS = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    },
    "anthropic": {
        "base_url": "https://api.anthropic.com/v1",
        "models": ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "models": ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-chat", "deepseek-reasoner"],
    },
    "cerebras": {
        "base_url": "https://api.cerebras.ai/v1",
        "models": ["llama-3.3-70b", "llama-3.1-8b"],
    },
}


@dataclass
class AgentConfig:
    """Configuration for a running agent."""
    agent_id: str
    name: str
    model: str = "gpt-4o-mini"
    system_prompt: str = "You are a helpful assistant."
    tools: list = field(default_factory=list)
    api_key: str = ""  # User provides their own key, or platform key
    provider: str = "openai"
    max_tokens: int = 2048
    temperature: float = 0.7


@dataclass
class AgentMessage:
    """A message in an agent conversation."""
    role: str  # system, user, assistant
    content: str


@dataclass
class AgentResponse:
    """Response from an agent."""
    content: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: float = 0.0
    cost_usd: float = 0.0
    error: str = ""


def detect_provider(model: str) -> str:
    """Detect provider from model name."""
    for provider, config in PROVIDERS.items():
        if model in config["models"] or model.startswith(provider):
            return provider
    return "openai"  # default


def get_provider_base_url(provider: str) -> str:
    """Get API base URL for a provider."""
    return PROVIDERS.get(provider, PROVIDERS["openai"])["base_url"]


async def run_agent(
    config: AgentConfig,
    messages: list[AgentMessage],
    api_key: str = "",
) -> AgentResponse:
    """
    Run an agent with a conversation history.
    
    Uses OpenAI-compatible API format (works with OpenAI, Groq, DeepSeek, Cerebras).
    For Anthropic, uses their native API.
    """
    start_time = time.time()
    provider = detect_provider(config.model)
    key = api_key or config.api_key

    if not key:
        return AgentResponse(
            content="",
            model=config.model,
            error="No API key provided. Please set your API key in settings.",
        )

    try:
        if provider == "anthropic":
            return await _run_anthropic(config, messages, key, start_time)
        else:
            return await _run_openai_compatible(config, messages, key, provider, start_time)
    except Exception as e:
        return AgentResponse(
            content="",
            model=config.model,
            error=str(e),
            latency_ms=(time.time() - start_time) * 1000,
        )


async def _run_openai_compatible(
    config: AgentConfig,
    messages: list[AgentMessage],
    api_key: str,
    provider: str,
    start_time: float,
) -> AgentResponse:
    """Run via OpenAI-compatible API (OpenAI, Groq, DeepSeek, Cerebras)."""
    base_url = get_provider_base_url(provider)

    # Build messages array
    api_messages = [{"role": "system", "content": config.system_prompt}]
    for msg in messages:
        api_messages.append({"role": msg.role, "content": msg.content})

    payload = {
        "model": config.model,
        "messages": api_messages,
        "max_tokens": config.max_tokens,
        "temperature": config.temperature,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base_url}/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=60,
        )
        data = resp.json()

        if "error" in data:
            return AgentResponse(
                content="",
                model=config.model,
                error=data["error"].get("message", str(data["error"])),
                latency_ms=(time.time() - start_time) * 1000,
            )

        choice = data.get("choices", [{}])[0]
        usage = data.get("usage", {})

        return AgentResponse(
            content=choice.get("message", {}).get("content", ""),
            model=config.model,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
            latency_ms=(time.time() - start_time) * 1000,
        )


async def _run_anthropic(
    config: AgentConfig,
    messages: list[AgentMessage],
    api_key: str,
    start_time: float,
) -> AgentResponse:
    """Run via Anthropic native API."""
    # Build messages array (Anthropic format)
    api_messages = []
    for msg in messages:
        if msg.role != "system":
            api_messages.append({"role": msg.role, "content": msg.content})

    payload = {
        "model": config.model,
        "system": config.system_prompt,
        "messages": api_messages,
        "max_tokens": config.max_tokens,
        "temperature": config.temperature,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            json=payload,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            timeout=60,
        )
        data = resp.json()

        if "error" in data:
            return AgentResponse(
                content="",
                model=config.model,
                error=data["error"].get("message", str(data["error"])),
                latency_ms=(time.time() - start_time) * 1000,
            )

        content = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                content += block.get("text", "")

        usage = data.get("usage", {})

        return AgentResponse(
            content=content,
            model=config.model,
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
            latency_ms=(time.time() - start_time) * 1000,
        )
