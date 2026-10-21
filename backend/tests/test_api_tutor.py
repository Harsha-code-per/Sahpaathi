from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import tutor
from app.main import app
from app.voice.tts import FakeTTS


class FakeClaude:
    """Stands in for anthropic.Anthropic: one canned reply, requests recorded."""

    def __init__(self, text: str = "Let us count pebbles. How many are in your hand?"):
        self.requests: list[dict] = []
        self._text = text
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        self.requests.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self._text)])


@pytest.fixture
def claude():
    fake = FakeClaude()
    app.dependency_overrides[tutor.get_client] = lambda: fake
    tutor._used.clear()
    yield fake
    app.dependency_overrides.clear()


def ask(messages=None, **extra):
    body = {"messages": messages or [{"role": "user", "content": "Teach me counting"}], **extra}
    return TestClient(app).post("/api/v1/tutor/chat", json=body)


def test_reply_comes_back(claude):
    res = ask()
    assert res.status_code == 200
    assert res.json() == {"reply": "Let us count pebbles. How many are in your hand?"}
    assert claude.requests[0]["model"] == tutor.MODEL


def test_prompt_follows_language_style_and_topic(claude):
    ask(language="ta", style="simple", topic="Place value")
    prompt = claude.requests[0]["system"]
    assert "Tamil" in prompt and "five years old" in prompt and "Place value" in prompt


def test_prompt_without_a_topic_asks_what_to_learn(claude):
    ask()
    assert "what they want to learn" in claude.requests[0]["system"]


def test_history_always_starts_with_the_learner(claude):
    ask(
        [
            {"role": "assistant", "content": "Hello!"},
            {"role": "user", "content": "Hi"},
        ]
    )
    assert claude.requests[0]["messages"][0]["role"] == "user"


def test_last_message_must_be_the_learners(claude):
    res = ask([{"role": "user", "content": "Hi"}, {"role": "assistant", "content": "Hello"}])
    assert res.status_code == 422


def test_rejects_unknown_language_and_empty_or_huge_messages(claude):
    assert ask(language="fr").status_code == 422
    assert ask([{"role": "user", "content": ""}]).status_code == 422
    assert ask([{"role": "user", "content": "x" * 1001}]).status_code == 422


def test_daily_cap_stops_the_spending(claude, monkeypatch):
    monkeypatch.setattr(tutor.settings, "tutor_daily_turns", 2)
    assert ask().status_code == 200
    assert ask().status_code == 200
    third = ask()
    assert third.status_code == 429
    assert len(claude.requests) == 2  # the capped call never reached Claude


def test_empty_claude_answer_is_a_clean_error(claude):
    claude._text = "  "
    assert ask().status_code == 502


def test_speak_without_a_server_voice_says_so(claude):
    app.dependency_overrides[tutor.get_voice] = lambda: None
    res = TestClient(app).post("/api/v1/tutor/speak", json={"text": "Hello", "language": "en"})
    assert res.status_code == 503


def test_speak_returns_a_wav(claude):
    app.dependency_overrides[tutor.get_voice] = lambda: FakeTTS()
    res = TestClient(app).post("/api/v1/tutor/speak", json={"text": "Hello", "language": "hi"})
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    assert res.content[:4] == b"RIFF"
