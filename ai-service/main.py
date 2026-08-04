from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Any

from polish import polish_bug_copy
from steps_humanize import humanize_steps

app = FastAPI(title="TestBuddy AI Service", version="0.3.0")


class BugPolishRequest(BaseModel):
    title: str = ""
    description: str = ""
    mode: str = Field(default="both", pattern="^(both|title|description)$")


class StepsHumanizeRequest(BaseModel):
    title: str = ""
    description: str = ""
    steps: list[dict[str, Any]] = Field(default_factory=list)


@app.get("/health")
def health():
    return {"status": "ok", "service": "testbuddy-ai"}


@app.get("/")
def root():
    return {
        "message": "TestBuddy AI service",
        "endpoints": [
            "GET /health",
            "POST /ai/bug/polish",
            "POST /ai/steps/humanize",
        ],
    }


@app.post("/ai/bug/polish")
async def ai_bug_polish(body: BugPolishRequest):
    if not body.title.strip() and not body.description.strip():
        raise HTTPException(status_code=400, detail="title or description is required")
    result = await polish_bug_copy(body.title, body.description, body.mode)  # type: ignore[arg-type]
    return result


@app.post("/ai/steps/humanize")
async def ai_steps_humanize(body: StepsHumanizeRequest):
    if not body.steps:
        raise HTTPException(status_code=400, detail="steps array is required")
    return await humanize_steps(
        body.steps,
        title=body.title,
        description=body.description,
    )
