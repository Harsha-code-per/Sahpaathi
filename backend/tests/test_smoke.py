import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.factory.schema import Episode
from app.main import app

SAMPLE = Path(__file__).parents[2] / "content/samples/g1-counting-hi-ta.json"


def test_health():
    assert TestClient(app).get("/health").json() == {"status": "ok"}


def test_sample_episode_matches_contract():
    Episode.model_validate_json(SAMPLE.read_text())


def test_contract_rejects_duplicate_ids_and_unknown_keys():
    data = json.loads(SAMPLE.read_text())
    data["analogy"][0]["id"] = "r1"
    with pytest.raises(ValidationError, match="duplicate line ids"):
        Episode.model_validate(data)
    data = json.loads(SAMPLE.read_text())
    data["surprise"] = 1
    with pytest.raises(ValidationError):
        Episode.model_validate(data)
