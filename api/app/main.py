from fastapi import FastAPI

app = FastAPI(title="BiletFlow API")


@app.get("/api/v1/health")
def health() -> dict:
    return {"ok": True, "service": "api"}


@app.get("/api/v1/events")
def list_events() -> dict:
    return {"items": []}
