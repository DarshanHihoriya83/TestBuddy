"""Shared LLM provider calls for TestBuddy AI service (Groq / OpenAI / Claude)."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


def provider() -> str:
    explicit = (os.getenv("LLM_PROVIDER") or "").strip().lower()
    if explicit in {"groq", "openai", "anthropic", "claude"}:
        return "anthropic" if explicit == "claude" else explicit
    if os.getenv("GROQ_API_KEY"):
        return "groq"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    if os.getenv("ANTHROPIC_API_KEY"):
        return "anthropic"
    return "none"


def extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        data = json.loads(text[start : end + 1])
        if isinstance(data, dict):
            return data
    raise ValueError("Model did not return valid JSON")


async def call_openai_compatible(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_content: str,
    temperature: float = 0.3,
) -> str:
    payload = {
        "model": model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        res.raise_for_status()
        data = res.json()
        return data["choices"][0]["message"]["content"]


async def call_anthropic(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_content: str,
    temperature: float = 0.3,
) -> str:
    payload = {
        "model": model,
        "max_tokens": 4096,
        "temperature": temperature,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_content}],
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        res.raise_for_status()
        data = res.json()
        parts = data.get("content") or []
        return "".join(p.get("text", "") for p in parts if p.get("type") == "text")


async def chat_json(*, system_prompt: str, user_content: str, temperature: float = 0.3) -> tuple[dict[str, Any], str, bool, str | None]:
    """
    Returns (parsed_json, provider_label, ai_used, warning).
    On failure returns ({}, "local-fallback", False, warning).
    """
    prov = provider()
    used = "local-fallback"
    warning: str | None = None
    try:
        if prov == "groq":
            key = os.getenv("GROQ_API_KEY", "")
            model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
            raw = await call_openai_compatible(
                base_url="https://api.groq.com/openai/v1",
                api_key=key,
                model=model,
                system_prompt=system_prompt,
                user_content=user_content,
                temperature=temperature,
            )
            used = f"groq:{model}"
        elif prov == "openai":
            key = os.getenv("OPENAI_API_KEY", "")
            model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
            base = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
            raw = await call_openai_compatible(
                base_url=base,
                api_key=key,
                model=model,
                system_prompt=system_prompt,
                user_content=user_content,
                temperature=temperature,
            )
            used = f"openai:{model}"
        elif prov == "anthropic":
            key = os.getenv("ANTHROPIC_API_KEY", "")
            model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
            raw = await call_anthropic(
                api_key=key,
                model=model,
                system_prompt=system_prompt,
                user_content=user_content,
                temperature=temperature,
            )
            used = f"anthropic:{model}"
        else:
            return {}, used, False, "No LLM API key configured"
        return extract_json(raw), used, True, None
    except Exception as exc:  # noqa: BLE001
        warning = f"LLM call failed ({prov}): {exc}"
        return {}, "local-fallback", False, warning
