from fastapi import APIRouter, Depends, FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.auth import router as auth_router
from app.config import settings
from app.db import ping_db

app = FastAPI(title="Sahpaathi API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth_router)
app.include_router(api_v1_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe: returns 200 when application process is running (Render keep-warm)."""
    return {"status": "ok"}


@app.get("/ready")
def ready(
    response: Response,
    db_ok: bool = Depends(ping_db),
) -> dict[str, str]:
    """Readiness probe: returns 200 when database is reachable, 503 if unavailable."""
    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "error", "db": "unavailable"}
    return {"status": "ok", "db": "connected"}
