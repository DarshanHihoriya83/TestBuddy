# TestBuddy AI Service

Internal-only FastAPI microservice. Phase 0: health/hello endpoint only.

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

Open http://127.0.0.1:8001/health
