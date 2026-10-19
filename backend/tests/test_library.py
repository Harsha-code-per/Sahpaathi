import json

import pytest

from app import library
from app.db import Base, SessionLocal, engine
from app.models import EpisodeRecord, User
from app.seed import seed
from tests.test_api_studio import EPISODE, REVIEW


@pytest.fixture
def db():
    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        seed(session, "demo-pass")
        yield session
    Base.metadata.drop_all(engine)


def test_reviewed_episodes_travel_from_studio_to_a_fresh_deploy(db, tmp_path):
    batch = tmp_path / "g1-numbers-to-20__chennai-migrant.json"
    out = {"passed": False, "episode": EPISODE.model_dump(), "review": REVIEW.model_dump()}
    batch.write_text(json.dumps(out, ensure_ascii=False))
    rec = library.queue(db, batch, "g1-numbers-to-20", "chennai-migrant")
    assert rec.status == "in_review"

    with pytest.raises(ValueError, match="not approved"):  # nobody has approved it yet
        library.export(db, rec.id, tmp_path / "lib")
    reviewer_id = db.query(User).filter_by(role="reviewer").one().id
    rec.status, rec.review_notes = "approved", "Checked every Tamil line."
    rec.reviewed_by_id = reviewer_id
    db.commit()
    path = library.export(db, rec.id, tmp_path / "lib")
    assert path.name == f"{EPISODE.id}.json"

    db.query(EpisodeRecord).delete()  # a fresh deploy: accounts but no episodes
    db.commit()
    assert library.load(db, tmp_path / "lib") == 1
    assert library.load(db, tmp_path / "lib") == 0  # every restart runs it; never twice
    loaded = db.query(EpisodeRecord).one()
    assert (loaded.status, loaded.review_notes) == ("approved", "Checked every Tamil line.")
    assert loaded.episode["id"] == EPISODE.id and loaded.reviewed_by_id is not None


def test_committed_library_episodes_are_valid(db):
    assert library.load(db) == len(list(library.LIBRARY.glob("*.json")))
