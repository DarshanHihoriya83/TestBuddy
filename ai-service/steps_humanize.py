"""
Humanize recorded bug steps + write Actual / Expected results via LLM (Groq etc.).
"""

from __future__ import annotations

import re
from typing import Any

from llm import chat_json

STEPS_SYSTEM = """You are a senior QA engineer writing bug reproduction steps for Jira/ADO.

You receive recorded browser actions (clicks, inputs, navigation) and optional defect notes.
Rewrite them into clear spreadsheet-style columns:

For EVERY step return:
- description: what the tester DID (action sentence). Professional, specific.
- actualResult: what HAPPENED after that action (outcome). Professional, specific.
- expectedResult: ONLY for defect/bug steps (has screenshotId OR isDefect true OR overview notes).
  For normal steps expectedResult MUST be null or "".

Rules:
1. Keep the same number of steps, same order. Use the given "order" values.
2. Do NOT invent controls, URLs, or values that are not in the input.
3. Password / masked values stay as •••• — never invent real secrets.
4. Wrap important labels and typed values in **double asterisks** for bold (e.g. Clicked the **Login** button).
5. Actual Result for normal steps = successful UI feedback of that action (field accepted value, button registered, page loaded).
6. For defect steps:
   - description = how the tester inspected/observed the issue (or the last action that revealed the bug)
   - actualResult = the observed defect in clear English (from overview / notes)
   - expectedResult = what SHOULD have happened instead (clear, testable, no vague "work correctly")
7. Fix Hinglish/typos in overview notes when writing actual/expected.
8. Return ONLY JSON:
{"steps":[{"order":1,"description":"...","actualResult":"...","expectedResult":null}]}
"""


def _clean(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _is_defect(step: dict[str, Any]) -> bool:
    if step.get("isDefect") is True:
        return True
    if step.get("screenshotId"):
        return True
    if _clean(step.get("expectedResult")):
        return True
    if _clean(step.get("overview")):
        return True
    return False


def _local_humanize_step(step: dict[str, Any]) -> dict[str, Any]:
    """Rule-based fallback when LLM is unavailable."""
    order = step.get("order") or 0
    action = (step.get("actionType") or "click").lower()
    label = _clean(step.get("elementLabel")) or "element"
    value = _clean(step.get("valueEntered"))
    overview = _clean(step.get("overview")) or _clean(step.get("actualResult"))
    description = _clean(step.get("description"))
    actual = _clean(step.get("actualResult"))
    expected = _clean(step.get("expectedResult"))
    defect = _is_defect(step)

    if not description:
        if action == "input" and value:
            description = f"Entered **{value}** in the **{label}** field"
        elif action == "click":
            description = f"Clicked **{label}**"
        elif action == "navigate":
            description = f"Navigated to **{label}**"
        elif action == "select" and value:
            description = f"Selected **{value}** from the **{label}** dropdown"
        else:
            description = f"Interacted with **{label}**"

    if defect:
        note = overview or actual or label
        # Strip "Observed defect:" prefixes for cleaner rewrite
        note = re.sub(r"^(observed defect:\s*)", "", note, flags=re.I)
        note = note.strip(" *")
        if not description or "highlighted" in description.lower():
            description = "Reviewed the highlighted area on the page and confirmed the defect"
        actual = f"Observed defect: **{note}**" if note else "A defect was observed on the page"
        expected = _local_expected(note)
    else:
        if not actual:
            if action == "input" and value:
                actual = f"**{label}** field accepted the value **{value}**"
            elif action == "click":
                actual = f"**{label}** click was registered on the page"
            elif action == "navigate":
                actual = f"Page **{label}** loaded in the browser"
            else:
                actual = f"Action on **{label}** completed on the page"
        expected = ""

    return {
        "order": order,
        "description": description,
        "actualResult": actual,
        "expectedResult": expected if defect else "",
    }


def _local_expected(note: str) -> str:
    lower = note.lower()
    if not note:
        return "The feature should behave according to the product requirements without this defect."
    if re.search(r"accept|allow|invalid|non[- ]?digit|character|letter|validation", lower):
        return (
            f"The field should validate input correctly and reject invalid data. "
            f"Issue “{note}” should not occur."
        )
    if re.search(r"error|fail|broken|not\s+work|unable|cannot|nahi", lower):
        return (
            f"The action should complete successfully without failure. "
            f"Issue “{note}” should not occur."
        )
    if re.search(r"otp|otp\s+not|not\s+receive|missing|nahi\s+aa", lower):
        return "The system should deliver the expected OTP/message successfully to the user."
    if re.search(r"display|show|visible|ui|layout|align", lower):
        return f"The UI should display the correct content/layout. “{note}” should not appear."
    return (
        f"The system should behave as designed. "
        f"The following defect should not occur: {note}."
    )


def local_humanize_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_local_humanize_step(s) for s in steps]


async def humanize_steps(
    steps: list[dict[str, Any]],
    *,
    title: str = "",
    description: str = "",
) -> dict[str, Any]:
    if not steps:
        return {"steps": [], "provider": "none", "ai": False}

    # Compact payload for the model
    compact = []
    for s in steps:
        compact.append(
            {
                "order": s.get("order"),
                "actionType": s.get("actionType"),
                "elementLabel": s.get("elementLabel"),
                "valueEntered": s.get("valueEntered"),
                "pageUrl": s.get("pageUrl"),
                "screenshotId": s.get("screenshotId") or None,
                "isDefect": _is_defect(s),
                "overview": s.get("overview") or None,
                "currentDescription": s.get("description") or "",
                "currentActual": s.get("actualResult") or "",
                "currentExpected": s.get("expectedResult") or "",
            }
        )

    user_content = (
        f"BUG TITLE:\n{(title or '').strip() or '(none)'}\n\n"
        f"BUG DESCRIPTION / NOTES:\n{(description or '').strip() or '(none)'}\n\n"
        f"RECORDED STEPS JSON:\n{compact}\n\n"
        "Rewrite every step. expectedResult only on isDefect/screenshot steps; else null.\n"
        'Return JSON: {"steps":[{"order":1,"description":"...","actualResult":"...","expectedResult":null}]}'
    )

    data, used, ai, warning = await chat_json(
        system_prompt=STEPS_SYSTEM,
        user_content=user_content,
        temperature=0.25,
    )

    fallback = local_humanize_steps(steps)
    if not ai or not isinstance(data.get("steps"), list):
        return {
            "steps": fallback,
            "provider": used,
            "ai": False,
            "warning": warning or "Model returned no steps — used local humanize",
        }

    by_order: dict[int, dict[str, Any]] = {}
    for item in data["steps"]:
        if not isinstance(item, dict):
            continue
        try:
            order = int(item.get("order"))
        except (TypeError, ValueError):
            continue
        by_order[order] = item

    merged: list[dict[str, Any]] = []
    for original, local in zip(steps, fallback):
        order = int(original.get("order") or local["order"])
        ai_step = by_order.get(order, {})
        defect = _is_defect(original)
        description_out = _clean(ai_step.get("description")) or local["description"]
        actual_out = _clean(ai_step.get("actualResult")) or local["actualResult"]
        expected_raw = ai_step.get("expectedResult")
        if defect:
            expected_out = _clean(expected_raw) if expected_raw is not None else ""
            if not expected_out:
                expected_out = local["expectedResult"]
        else:
            expected_out = ""
        merged.append(
            {
                "order": order,
                "description": description_out,
                "actualResult": actual_out,
                "expectedResult": expected_out,
            }
        )

    return {
        "steps": merged,
        "provider": used,
        "ai": True,
        "warning": warning,
    }
