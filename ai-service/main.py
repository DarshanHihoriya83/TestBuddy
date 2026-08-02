from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from polish import polish_bug_copy

app = FastAPI(title="TestBuddy AI Service", version="0.2.0")


class BugPolishRequest(BaseModel):
    title: str = ""
    description: str = ""
    mode: str = Field(default="both", pattern="^(both|title|description)$")


@app.get("/health")
def health():
    return {"status": "ok", "service": "testbuddy-ai"}


@app.get("/")
def root():
    return {
        "message": "TestBuddy AI service",
        "endpoints": ["GET /health", "POST /ai/bug/polish"],
    }


@app.post("/ai/bug/polish")
async def ai_bug_polish(body: BugPolishRequest):
    if not body.title.strip() and not body.description.strip():
        raise HTTPException(status_code=400, detail="title or description is required")
    result = await polish_bug_copy(body.title, body.description, body.mode)  # type: ignore[arg-type]
    return result
