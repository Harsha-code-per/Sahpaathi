from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app import auth, dashboard, demo, episodes, insights, packs, recordings, sync, tutor
from app.config import settings
from app.db import SessionLocal
from app.ivr import exotel
from app.ivr import routes as ivr


@asynccontextmanager
async def lifespan(_: FastAPI):
    with SessionLocal() as db:
        episodes.fail_orphans(db)
        packs.fail_orphans(db)
    yield


class JsonGZip:
    """Gzips API responses for clients that accept it (JSON shrinks ~5x on a slow link).

    Pack downloads and IVR audio are already compressed, and a gzipped body would break resumed
    (Range) downloads, so they pass through.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.gzip = GZipMiddleware(app, minimum_size=1000)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        skip = (
            scope["type"] != "http"
            or "/packs" in path
            or path.startswith("/api/v1/ivr")
            or any(k == b"range" for k, _ in scope["headers"])
        )
        await (self.app if skip else self.gzip)(scope, receive, send)


app = FastAPI(title="Sahpaathi API", version="0.1.0", lifespan=lifespan)
app.add_middleware(JsonGZip)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    # Browsers hide these from cross-origin JavaScript unless exposed: the Admin download reads the
    # filename, and a resumed pack download reads the range.
    expose_headers=["Content-Disposition", "Content-Range", "Accept-Ranges"],
)
app.include_router(auth.router)
app.include_router(demo.router)
app.include_router(episodes.router)
app.include_router(packs.router)
app.include_router(sync.router)
app.include_router(recordings.router)
app.include_router(tutor.router)
app.include_router(dashboard.router)
app.include_router(insights.router)
app.include_router(ivr.router)
app.include_router(exotel.router)


# HEAD too: uptime monitors probe with HEAD by default and would read a 405 as "down".
@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> dict[str, str]:
    return {"status": "ok"}
