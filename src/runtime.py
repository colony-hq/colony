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

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import AsyncIterator

import httpx

logger = logging.getLogger("colony.runtime")

# ---------------------------------------------------------------------------
# Custom errors
# ---------------------------------------------------------------------------

class LLMError(Exception):
    """Base class for all LLM runtime errors."""


class RateLimitError(LLMError):
    """Raised when the provider returns 429."""


class AuthError(LLMError):
    """Raised on 401 / 403 from the provider."""


class TimeoutError(LLMError):
    """Raised when a request exceeds the configured timeout."""


class ProviderError(LLMError):
    """Raised on 5xx or unexpected provider-side failures."""


# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------

PROVIDERS: dict[str, dict] = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
        "env_key": "OPENAI_API_KEY",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
    "anthropic": {
        "base_url": "https://api.anthropic.com/v1",
        "models": [
            "claude-sonnet-4-20250514",
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229",
            "claude-3-haiku-20240307",
        ],
        "env_key": "ANTHROPIC_API_KEY",
        "auth_header": "x-api-key",
        "auth_prefix": "",
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "models": ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
        "env_key": "GROQ_API_KEY",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-chat", "deepseek-reasoner"],
        "env_key": "DEEPSEEK_API_KEY",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
    "cerebras": {
        "base_url": "https://api.cerebras.ai/v1",
        "models": ["llama-3.3-70b", "llama-3.1-8b"],
        "env_key": "CEREBRAS_API_KEY",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
}

# Model aliases → canonical provider
_MODEL_ALIASES: dict[str, str] = {
    # Claude aliases
    "claude-3-5-sonnet": "anthropic",
    "claude-3-opus": "anthropic",
    "claude-3-haiku": "anthropic",
    "claude-3-sonnet": "anthropic",
    "claude-sonnet": "anthropic",
    "claude-opus": "anthropic",
    "claude-haiku": "anthropic",
    "claude": "anthropic",
    # GPT aliases
    "gpt-4o": "openai",
    "gpt-4": "openai",
    "gpt-3.5": "openai",
    # Llama aliases (shared across groq/cerebras – default to groq)
    "llama-3.3-70b-versatile": "groq",
    "llama-3.3-70b": "cerebras",
    "llama": "groq",
    # DeepSeek
    "deepseek-chat": "deepseek",
    "deepseek-reasoner": "deepseek",
    "deepseek": "deepseek",
}

# ---------------------------------------------------------------------------
# Cost estimation  (USD per 1 000 000 tokens, as of 2025)
# ---------------------------------------------------------------------------

_COST_PER_MILLION_TOKENS: dict[str, tuple[float, float]] = {
    # (input $/1M, output $/1M)
    # OpenAI
    "gpt-4o":                (2.50,  10.00),
    "gpt-4o-mini":           (0.15,   0.60),
    "gpt-4-turbo":          (10.00,  30.00),
    "gpt-4":                (30.00,  60.00),
    "gpt-3.5-turbo":         (0.50,   1.50),
    # Anthropic
    "claude-sonnet-4-20250514":   (3.00,  15.00),
    "claude-3-5-sonnet-20241022": (3.00,  15.00),
    "claude-3-5-haiku-20241022":  (1.00,   5.00),
    "claude-3-opus-20240229":    (15.00,  75.00),
    "claude-3-haiku-20240307":    (0.25,   1.25),
    # Groq (pricing is very low – approximate)
    "llama-3.3-70b-versatile":   (0.59,   0.79),
    "mixtral-8x7b-32768":        (0.24,   0.24),
    # DeepSeek
    "deepseek-chat":             (0.14,   0.28),
    "deepseek-reasoner":         (0.55,   2.19),
    # Cerebras
    "llama-3.3-70b":             (0.60,   0.60),
    "llama-3.1-8b":              (0.10,   0.10),
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Return estimated cost in USD for a given model and token counts."""
    in_rate, out_rate = _COST_PER_MILLION_TOKENS.get(model, (3.00, 15.00))
    return (input_tokens * in_rate + output_tokens * out_rate) / 1_000_000


# ---------------------------------------------------------------------------
# Dataclasses (backward-compatible)
# ---------------------------------------------------------------------------

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
    timeout: float = 30.0          # seconds, per-request
    max_retries: int = 3           # total attempts on transient errors


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


# ---------------------------------------------------------------------------
# Provider helpers
# ---------------------------------------------------------------------------

def _resolve_api_key(provider: str, user_key: str) -> str:
    """Return the best available API key: explicit > env var > error."""
    if user_key:
        return user_key
    env_var = PROVIDERS.get(provider, {}).get("env_key", "")
    env_val = os.environ.get(env_var, "")
    if env_val:
        return env_val
    return ""


def detect_provider(model: str) -> str:
    """Detect provider from model name, using explicit models first, then aliases."""
    # 1) Exact match in PROVIDERS[provider]["models"]
    for provider, config in PROVIDERS.items():
        if model in config["models"]:
            return provider
    # 2) Alias table (prefix match)
    for alias, provider in _MODEL_ALIASES.items():
        if model.startswith(alias):
            return provider
    # 3) Fallback: see if the model string starts with a provider name
    for provider in PROVIDERS:
        if model.startswith(provider):
            return provider
    return "openai"  # sensible default


def get_provider_base_url(provider: str) -> str:
    """Get API base URL for a provider."""
    return PROVIDERS.get(provider, PROVIDERS["openai"])["base_url"]


# ---------------------------------------------------------------------------
# Retry / backoff helpers
# ---------------------------------------------------------------------------

_TRANSIENT_STATUS_CODES = {429, 500, 502, 503, 504}


def _is_transient(status_code: int) -> bool:
    return status_code in _TRANSIENT_STATUS_CODES


async def _sleep_backoff(attempt: int) -> None:
    """Exponential backoff: 1 s, 2 s, 4 s …"""
    delay = min(2 ** attempt, 30)  # cap at 30 s
    await asyncio.sleep(delay)


# ---------------------------------------------------------------------------
# Logging helper
# ---------------------------------------------------------------------------

def _log_call(
    model: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: float,
    cost_usd: float,
    error: str = "",
) -> None:
    msg = (
        f"LLM call model={model} "
        f"in_tok={input_tokens} out_tok={output_tokens} "
        f"latency={latency_ms:.0f}ms cost=${cost_usd:.6f}"
    )
    if error:
        msg += f" error={error!r}"
        logger.warning(msg)
    else:
        logger.info(msg)


# ---------------------------------------------------------------------------
# Streaming support
# ---------------------------------------------------------------------------

async def run_agent_stream(
    config: AgentConfig,
    messages: list[AgentMessage],
    api_key: str = "",
) -> AsyncIterator[str]:
    """Stream an agent response token-by-token.

    Yields content chunks as they arrive from the provider.  Raises LLMError
    subclasses on failure (no graceful AgentResponse for streaming).
    """
    provider = config.provider or detect_provider(config.model)
    key = _resolve_api_key(provider, api_key or config.api_key)
    if not key:
        raise AuthError(
            "No API key provided. Set one in settings or export the "
            f"{PROVIDERS[provider]['env_key']} environment variable."
        )

    async with httpx.AsyncClient() as client:
        if provider == "anthropic":
            async for chunk in _stream_anthropic(client, config, messages, key):
                yield chunk
        else:
            async for chunk in _stream_openai_compatible(client, config, messages, key, provider):
                yield chunk


async def _stream_openai_compatible(
    client: httpx.AsyncClient,
    config: AgentConfig,
    messages: list[AgentMessage],
    api_key: str,
    provider: str,
) -> AsyncIterator[str]:
    base_url = get_provider_base_url(provider)
    api_messages = [{"role": "system", "content": config.system_prompt}]
    for msg in messages:
        api_messages.append({"role": msg.role, "content": msg.content})

    payload = {
        "model": config.model,
        "messages": api_messages,
        "max_tokens": config.max_tokens,
        "temperature": config.temperature,
        "stream": True,
    }

    pcfg = PROVIDERS[provider]
    headers = {pcfg["auth_header"]: f"{pcfg['auth_prefix']}{api_key}"}

    async with client.stream(
        "POST",
        f"{base_url}/chat/completions",
        json=payload,
        headers=headers,
        timeout=config.timeout,
    ) as resp:
        _raise_for_status(resp.status_code)
        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            data = line[6:]
            if data.strip() == "[DONE]":
                break
            try:
                obj = _json_loads(data)
                delta = obj.get("choices", [{}])[0].get("delta", {})
                content = delta.get("content", "")
                if content:
                    yield content
            except Exception:
                continue


async def _stream_anthropic(
    client: httpx.AsyncClient,
    config: AgentConfig,
    messages: list[AgentMessage],
    api_key: str,
) -> AsyncIterator[str]:
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
        "stream": True,
    }

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    async with client.stream(
        "POST",
        "https://api.anthropic.com/v1/messages",
        json=payload,
        headers=headers,
        timeout=config.timeout,
    ) as resp:
        _raise_for_status(resp.status_code)
        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            try:
                obj = _json_loads(line[6:])
                if obj.get("type") == "content_block_delta":
                    text = obj.get("delta", {}).get("text", "")
                    if text:
                        yield text
            except Exception:
                continue


# ---------------------------------------------------------------------------
# Non-streaming entry point (backward-compatible)
# ---------------------------------------------------------------------------

async def run_agent(
    config: AgentConfig,
    messages: list[AgentMessage],
    api_key: str = "",
    stream: bool = False,
) -> AgentResponse:
    """Run an agent with a conversation history.

    Uses OpenAI-compatible API format (works with OpenAI, Groq, DeepSeek,
    Cerebras).  For Anthropic, uses their native API.

    If *stream* is True the caller should use ``run_agent_stream`` instead;
    when called here with stream=True a full response is still collected and
    returned as an AgentResponse for backward compatibility.
    """
    start_time = time.monotonic()
    provider = config.provider or detect_provider(config.model)
    key = _resolve_api_key(provider, api_key or config.api_key)

    if not key:
        err = (
            "No API key provided. Set one in settings or export the "
            f"{PROVIDERS[provider]['env_key']} environment variable."
        )
        return AgentResponse(content="", model=config.model, error=err)

    last_exc: Exception | None = None
    for attempt in range(max(config.max_retries, 1)):
        try:
            if provider == "anthropic":
                resp = await _run_anthropic(client=None, config=config, messages=messages, api_key=key)
            else:
                resp = await _run_openai_compatible(
                    client=None, config=config, messages=messages,
                    api_key=key, provider=provider,
                )
            resp.latency_ms = (time.monotonic() - start_time) * 1000
            resp.cost_usd = estimate_cost(resp.model, resp.input_tokens, resp.output_tokens)
            _log_call(resp.model, resp.input_tokens, resp.output_tokens,
                      resp.latency_ms, resp.cost_usd)
            return resp

        except (RateLimitError, ProviderError, httpx.TimeoutException) as exc:
            last_exc = exc
            if attempt < config.max_retries - 1:
                logger.warning(
                    "Attempt %d/%d failed (%s), retrying in %ds …",
                    attempt + 1, config.max_retries, exc, 2 ** attempt,
                )
                await _sleep_backoff(attempt)
            continue

        except AuthError:
            # Don't retry auth failures
            latency = (time.monotonic() - start_time) * 1000
            _log_call(config.model, 0, 0, latency, 0.0, error=str(exc))
            return AgentResponse(
                content="", model=config.model, error=str(exc),
                latency_ms=latency,
            )

        except Exception as exc:
            latency = (time.monotonic() - start_time) * 1000
            _log_call(config.model, 0, 0, latency, 0.0, error=str(exc))
            return AgentResponse(
                content="", model=config.model, error=str(exc),
                latency_ms=latency,
            )

    # All retries exhausted
    latency = (time.monotonic() - start_time) * 1000
    err_msg = f"All {config.max_retries} attempts failed: {last_exc}"
    _log_call(config.model, 0, 0, latency, 0.0, error=err_msg)
    return AgentResponse(
        content="", model=config.model, error=err_msg,
        latency_ms=latency,
    )


# ---------------------------------------------------------------------------
# Internal: OpenAI-compatible provider
# ---------------------------------------------------------------------------

async def _run_openai_compatible(
    *,
    client: httpx.AsyncClient | None,
    config: AgentConfig,
    messages: list[AgentMessage],
    api_key: str,
    provider: str,
) -> AgentResponse:
    """Run via OpenAI-compatible API (OpenAI, Groq, DeepSeek, Cerebras)."""
    base_url = get_provider_base_url(provider)

    api_messages = [{"role": "system", "content": config.system_prompt}]
    for msg in messages:
        api_messages.append({"role": msg.role, "content": msg.content})

    payload = {
        "model": config.model,
        "messages": api_messages,
        "max_tokens": config.max_tokens,
        "temperature": config.temperature,
    }

    pcfg = PROVIDERS[provider]
    headers = {pcfg["auth_header"]: f"{pcfg['auth_prefix']}{api_key}"}

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient()

    try:
        resp = await client.post(
            f"{base_url}/chat/completions",
            json=payload,
            headers=headers,
            timeout=config.timeout,
        )

        _raise_for_status(resp.status_code)

        data = resp.json()
        if "error" in data:
            _raise_from_provider_error(data["error"])

        choice = data.get("choices", [{}])[0]
        usage = data.get("usage", {})

        return AgentResponse(
            content=choice.get("message", {}).get("content", ""),
            model=config.model,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
        )

    finally:
        if owns_client:
            await client.aclose()


# ---------------------------------------------------------------------------
# Internal: Anthropic native provider
# ---------------------------------------------------------------------------

async def _run_anthropic(
    *,
    client: httpx.AsyncClient | None,
    config: AgentConfig,
    messages: list[AgentMessage],
    api_key: str,
) -> AgentResponse:
    """Run via Anthropic native API."""
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

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient()

    try:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            json=payload,
            headers=headers,
            timeout=config.timeout,
        )

        _raise_for_status(resp.status_code)

        data = resp.json()
        if "error" in data:
            _raise_from_provider_error(data["error"])

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
        )

    finally:
        if owns_client:
            await client.aclose()


# ---------------------------------------------------------------------------
# Error mapping
# ---------------------------------------------------------------------------

def _raise_for_status(status_code: int) -> None:
    """Translate HTTP status codes into typed LLMError subclasses."""
    if status_code == 200:
        return
    if status_code in (401, 403):
        raise AuthError(f"Authentication failed (HTTP {status_code})")
    if status_code == 429:
        raise RateLimitError("Rate limited (HTTP 429)")
    if status_code in (500, 502, 503, 504):
        raise ProviderError(f"Provider error (HTTP {status_code})")
    raise ProviderError(f"Unexpected HTTP {status_code}")


def _raise_from_provider_error(err: dict | str) -> None:
    """Raise an appropriate LLMError from a provider error payload."""
    msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
    err_type = (err.get("type") if isinstance(err, dict) else "") or ""
    code = (err.get("code") if isinstance(err, dict) else "") or ""

    if "rate" in msg.lower() or code == "rate_limit" or err_type == "rate_limit_error":
        raise RateLimitError(msg)
    if "auth" in msg.lower() or code in ("invalid_api_key", "authentication_error"):
        raise AuthError(msg)
    if "timeout" in msg.lower():
        raise TimeoutError(msg)
    raise ProviderError(msg)


# Small helper to avoid importing json just for SSE lines
import json as _json_module  # noqa: E402

def _json_loads(s: str):
    return _json_module.loads(s)
