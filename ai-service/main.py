from fastapi import FastAPI

app = FastAPI(title="TestBuddy AI Service", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "testbuddy-ai"}


@app.get("/")
def root():
    return {
        "message": "TestBuddy AI service hello-world",
        "note": "Humanize / expected-result / testcase endpoints arrive in Phase 3+",
    }
