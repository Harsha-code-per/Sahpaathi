import json
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.factory.scriptwriter import District, Lesson, ScriptwriterError, write_episode

CONTENT = Path(__file__).parents[2] / "content"
SAMPLE = (CONTENT / "samples/g1-counting-hi-ta.json").read_text()
LESSON = Lesson.model_validate_json((CONTENT / "curriculum/g1-numbers-to-20.json").read_text())
DISTRICT = District.model_validate_json((CONTENT / "districts/chennai-migrant.json").read_text())


def _client(*replies: tuple[str, str]):
    """Stands in for anthropic.Anthropic: canned (text, stop_reason) replies; records requests."""
    replies_left = list(replies)
    requests: list[dict] = []

    def stream(**kwargs):
        requests.append({**kwargs, "messages": list(kwargs["messages"])})
        text, stop = replies_left.pop(0)
        message = SimpleNamespace(
            model="stub",
            usage=None,
            stop_reason=stop,
            content=[SimpleNamespace(type="text", text=text)],
        )
        return nullcontext(SimpleNamespace(get_final_message=lambda: message))

    messages = SimpleNamespace(stream=stream)
    return SimpleNamespace(beta=SimpleNamespace(messages=messages), requests=requests)


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
