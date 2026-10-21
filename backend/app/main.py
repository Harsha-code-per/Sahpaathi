from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app import auth, dashboard, demo, episodes, insights, packs, sync, tutor
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


class BodyLimit:
    """Refuses an oversized body before it is read: the open endpoints (/sync, /tutor) would
    otherwise hold any upload in memory on a 512 MB instance. A plan may carry a PDF or photo.
    ponytail: trusts Content-Length; a chunked upload without one is not counted."""

    PLAN_PATH, PLAN_MAX, DEFAULT_MAX = "/api/v1/tutor/plan", 8_000_000, 1_000_000

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            length = dict(scope["headers"]).get(b"content-length", b"0")
            limit = self.PLAN_MAX if scope["path"] == self.PLAN_PATH else self.DEFAULT_MAX
            if not length.isdigit() or int(length) > limit:
                too_big = JSONResponse({"detail": "That is too large to send."}, status_code=413)
                await too_big(scope, receive, send)
                return
        await self.app(scope, receive, send)


app = FastAPI(title="Sahpaathi API", version="0.1.0", lifespan=lifespan)
app.add_middleware(JsonGZip)
app.add_middleware(BodyLimit)  # added before CORS, so a 413 still carries the CORS headers
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
app.include_router(tutor.router)
app.include_router(dashboard.router)
app.include_router(insights.router)
app.include_router(ivr.router)
app.include_router(exotel.router)


# HEAD too: uptime monitors probe with HEAD by default and would read a 405 as "down".
@app.api_route("/health", methods=["GET", "HEAD"])
def health() -> dict[str, str]:
    return {"status": "ok"}
