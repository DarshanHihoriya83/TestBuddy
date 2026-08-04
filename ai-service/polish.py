"""
TestBuddy AI — bug title/description polish via Groq / OpenAI / Claude.
Falls back to a strong local template if no API key is configured.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from llm import chat_json

Mode = Literal["both", "title", "description"]

SYSTEM_PROMPT = """You are a senior QA engineer who writes bug reports for Jira and Azure DevOps.
You write like ChatGPT / Claude: clear, specific, professional, and easy to scan.

Given rough tester notes (typos, Hinglish, slang, incomplete phrases are OK), produce:

1) TITLE — one sentence-case defect title, max 90 characters.
   - Specific (name the control/feature + what is wrong)
   - No trailing period
   - Prefer: "Mobile number field accepts non-digit characters"
     over: "Bug in form" or "Not working"

2) DESCRIPTION — exactly this structure (use these headings):

Summary
<1–2 sentences: what is wrong>

Observed behavior
<what actually happens>

Expected behavior
<what should happen>

Impact
<one sentence business/user impact — only if reasonably implied; otherwise omit this entire section>

Rules:
- Fix spelling and grammar; expand abbreviations (mob→mobile, pwd→password, etc.)
- Do NOT invent reproduction steps, URLs, or features that are not implied
- Do NOT invent error message text unless the notes mention it
- Keep a calm, factual QA tone — not marketing fluff
- Return ONLY valid JSON with keys "title" and "description" (no markdown fences)
"""


def _local_fallback(title: str, description: str) -> dict[str, str]:
    """Professional template when no LLM key is available."""
    raw = " ".join(x for x in [title.strip(), description.strip()] if x).strip()
    raw = re.sub(r"\s+", " ", raw)
    if not raw:
        return {
            "title": "Reported defect requires investigation",
            "description": (
                "Summary\n"
                "A defect was reported without enough detail.\n\n"
                "Observed behavior\n"
                "The reported behavior does not match the expected result.\n\n"
                "Expected behavior\n"
                "The feature should behave according to the product requirements."
            ),
        }

    cleaned = raw
    phrase_fixes = [
        (r"\bmob(?:ile)?\s*(?:no\.?|num(?:be?r)?|#)?\b", "mobile number"),
        (r"\bph(?:one)?\s*(?:no\.?|num(?:be?r)?|#)?\b", "phone number"),
        (r"\bnumbe\b|\bnumbr\b", "number"),
        (r"\bpwd\b|\bpswd\b|\bpasswrd\b|\bpasword\b", "password"),
        (r"\bnahi\b|\bnhi\b", "not"),
        (r"\bgalat\b", "incorrect"),
        (r"\b\s*hai\b|\b\s*hua\b", ""),
        (r"\bdoesnt\b|\bdont\b", "does not"),
        (r"\bcant\b", "cannot"),
        (r"\bfeild\b|\bfiled\b", "field"),
        (r"\bbuton\b|\bbtn\b", "button"),
        (r"\beror\b|\berorr\b", "error"),
        (r"\baccept\b(?!s)", "accepts"),
        (r"\bnot\s+digit\b|\bnon\s*digit\b", "non-digit characters"),
        (r"\balphabet\b", "letters"),
    ]
    for pat, rep in phrase_fixes:
        cleaned = re.sub(pat, rep, cleaned, flags=re.I)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")

    lower = cleaned.lower()
    if "mobile number" in lower and ("non-digit" in lower or "letter" in lower or "accept" in lower):
        title_out = "Mobile number field accepts non-digit characters"
        observed = (
            "The mobile number field accepts letters or other non-digit characters "
            "instead of restricting input to digits only."
        )
        expected = (
            "The mobile number field should accept digits only and reject non-digit input."
        )
        impact = "Invalid mobile numbers may be submitted or stored."
    elif "password" in lower and "error" in lower:
        title_out = "Password field shows an unexpected validation error"
        observed = "The password field displays an error even when input appears valid."
        expected = "Validation errors should appear only for invalid password input."
        impact = "Users may be blocked from completing authentication."
    elif "login" in lower and ("not" in lower or "fail" in lower or "work" in lower):
        title_out = "Login action does not complete successfully"
        observed = "The login action does not complete or responds incorrectly."
        expected = "Valid credentials should allow the user to sign in successfully."
        impact = "Users may be unable to access the application."
    else:
        title_out = cleaned[:1].upper() + cleaned[1:]
        if len(title_out) > 90:
            title_out = title_out[:87].rsplit(" ", 1)[0] + "…"
        if not re.search(
            r"\b(is|are|does|not|accepts|shows|fails|loads|displays|incorrect|invalid|unable|cannot|missing|broken)\b",
            title_out,
            re.I,
        ):
            title_out = f"{title_out} does not function correctly"
        observed = (
            f"Based on the reported notes (“{cleaned}”), the current behavior "
            "does not match the intended product behavior."
        )
        expected = (
            "The feature should validate input and complete the user action successfully "
            "according to the requirements."
        )
        impact = "Users may be blocked or confused while completing this flow."

    desc = (
        f"Summary\n"
        f"{title_out.rstrip('.')}.\n\n"
        f"Observed behavior\n"
        f"{observed}\n\n"
        f"Expected behavior\n"
        f"{expected}\n\n"
        f"Impact\n"
        f"{impact}"
    )
    return {"title": title_out, "description": desc}


async def polish_bug_copy(
    title: str = "",
    description: str = "",
    mode: Mode = "both",
) -> dict[str, Any]:
    title = (title or "").strip()
    description = (description or "").strip()
    user_content = (
        f"MODE: {mode}\n"
        f"ROUGH TITLE:\n{title or '(empty)'}\n\n"
        f"ROUGH DESCRIPTION / NOTES:\n{description or '(empty)'}\n\n"
        "Return JSON: {\"title\": \"...\", \"description\": \"...\"}"
    )

    data, used, ai, warning = await chat_json(
        system_prompt=SYSTEM_PROMPT,
        user_content=user_content,
        temperature=0.35,
    )

    if not ai:
        result = _local_fallback(title, description)
        return {**result, "provider": used, "ai": False, "warning": warning}

    local = _local_fallback(title, description)
    out_title = str(data.get("title") or "").strip() or local["title"]
    out_desc = str(data.get("description") or "").strip() or local["description"]

    if mode == "title":
        if description:
            out_desc = description
    elif mode == "description":
        if title:
            out_title = title

    return {
        "title": out_title[:120],
        "description": out_desc,
        "provider": used,
        "ai": True,
        "warning": warning,
    }
