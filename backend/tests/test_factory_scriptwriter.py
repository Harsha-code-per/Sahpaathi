import json
from pathlib import Path

import pytest
from stub_client import stub_client

from app.factory.scriptwriter import District, Lesson, ScriptwriterError, write_episode

CONTENT = Path(__file__).parents[2] / "content"
SAMPLE = (CONTENT / "samples/g1-counting-hi-ta.json").read_text()
LESSON = Lesson.model_validate_json((CONTENT / "curriculum/g1-numbers-to-20.json").read_text())
DISTRICT = District.model_validate_json((CONTENT / "districts/chennai-migrant.json").read_text())


def _client(*replies: tuple[str, str]):
    client = stub_client(writer=replies)
    client.requests = client.requests["writer"]
    return client


def test_valid_episode_gets_deterministic_id_and_local_brief():
    client = _client((SAMPLE, "end_turn"))
    episode = write_episode(LESSON, DISTRICT, client=client)
    assert episode.id == "g1-numbers-to-20-chennai-migrant"
    brief = client.requests[0]["messages"][0]["content"]
    assert "Hindi" in brief and "Tamil" in brief and DISTRICT.names[0] in brief
    assert client.requests[0]["model"] == "claude-sonnet-5-5"


def test_invalid_output_gets_one_repair_turn():
    broken = json.loads(SAMPLE)
    broken["analogy"][0]["id"] = "r1"  # duplicate id
    client = _client((json.dumps(broken), "end_turn"), (SAMPLE, "end_turn"))
    write_episode(LESSON, DISTRICT, client=client)
    repair = client.requests[1]["messages"][-1]["content"]
    assert "duplicate line ids" in repair


def test_still_invalid_after_repair_raises():
    client = _client(("{}", "end_turn"), ("{}", "end_turn"))
    with pytest.raises(ScriptwriterError, match="still invalid"):
        write_episode(LESSON, DISTRICT, client=client)


def test_refusal_and_truncation_raise():
    for stop in ("refusal", "max_tokens"):
        with pytest.raises(ScriptwriterError, match=stop):
            write_episode(LESSON, DISTRICT, client=_client(("", stop)))


def test_phrase_bank_constrains_home_language_lines():
    client = _client((SAMPLE, "end_turn"))
    write_episode(LESSON, DISTRICT, phrase_bank=["ᱡᱚᱦᱟᱨ"], client=client)
    assert "- ᱡᱚᱦᱟᱨ" in client.requests[0]["messages"][0]["content"]


def test_all_content_inputs_parse():
    for f in (CONTENT / "curriculum").glob("*.json"):
        Lesson.model_validate_json(f.read_text())
    for f in (CONTENT / "districts").glob("*.json"):
        District.model_validate_json(f.read_text())


def test_rule_failure_gets_repair_turn_with_rule_message():
    unbridged = (Path(__file__).parent / "fixtures/g1-unbridged-episode.json").read_text()
    client = _client((unbridged, "end_turn"), (SAMPLE, "end_turn"))
    write_episode(LESSON, DISTRICT, client=client)
    assert "at least 50% school language" in client.requests[1]["messages"][-1]["content"]


def test_repair_that_breaks_the_contract_keeps_the_valid_first_attempt():
    client = _client((SAMPLE, "end_turn"), ("{}", "end_turn"))
    episode = write_episode(LESSON, DISTRICT, client=client, feedback=lambda ep: ["too long"])
    assert len(client.requests) == 2  # the soft problem earned the repair, which came back broken
    assert episode.id == "g1-numbers-to-20-chennai-migrant"
