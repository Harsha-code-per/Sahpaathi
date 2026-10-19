from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_cross_origin_pages_may_read_the_download_filename_and_range():
    # The app (Vercel) and the API (Render) are different origins; without this the Admin download
    # cannot read Content-Disposition and falls back to a generic name.
    origin = settings.cors_origins[0]
    res = TestClient(app).get("/health", headers={"Origin": origin})
    exposed = {h.strip().lower() for h in res.headers["access-control-expose-headers"].split(",")}
    assert {"content-disposition", "content-range", "accept-ranges"} <= exposed
