from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import auth, dashboard, episodes, packs, sync
from app.config import settings
from app.db import SessionLocal
from app.ivr import routes as ivr


@asynccontextmanager
async def lifespan(_: FastAPI):
    with SessionLocal() as db:
        episodes.fail_orphans(db)
        packs.fail_orphans(db)
    yield


app = FastAPI(title="Sahpaathi API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(episodes.router)
app.include_router(packs.router)
app.include_router(sync.router)
app.include_router(dashboard.router)
app.include_router(ivr.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
