"""The tutor's rules (engine) with a scripted brain, and its HTTP API with a fake one."""

import pytest
from fastapi.testclient import TestClient

from app import tutor
from app.db import Base
from app.db import engine as db_engine
from app.main import app
from app.tutor import engine
from app.tutor.models import (
    ChatResult,
    Judgement,
    Message,
    Part,
    Plan,
    Progress,
    Question,
    TurnIn,
)
from app.voice.tts import FakeTTS


def question(n: int) -> Question:
    return Question(ask=f"Question {n}?", answer=f"answer {n}", hint=f"hint {n}")


def part(title: str, first: int) -> Part:
    return Part(
        title=title,
        points=["a point"],
        example="an example",
        minutes=3,
        quiz=[question(first), question(first + 1)],
    )


PLAN = Plan(title="Tens and ones", parts=[part("Tens", 1), part("Ones", 3)])


class ScriptedBrain:
    """Judgements are scripted; every spoken turn is just its action name, and is recorded."""

    def __init__(self, *judgements: Judgement):
        self.judgements = list(judgements)
        self.said: list[engine.Directive] = []
        self.chat_result = ChatResult(reply="Hi there!")

    def chat(self, history, language, style):
        return self.chat_result

    def judge(self, history, text, mode, part, question, language):
        return self.judgements.pop(0)

    def say(self, directive, history, language, style):
        self.said.append(directive)
        return f"SAY:{directive.action}"

    def riddle(self, plan, part, language, style):
        return Question(ask="What has hands but cannot clap?", answer="a clock", hint="Time.")


def say(intent="ready", verdict=None, **kw) -> Judgement:
    return Judgement(intent=intent, verdict=verdict, **kw)


def run(brain, progress, text="ok", **kw):
    return engine.step(brain, TurnIn(text=text, plan=PLAN, progress=progress, **kw))


def test_chat_stays_chat_and_can_ask_to_study():
    brain = ScriptedBrain()
    brain.chat_result = ChatResult(reply="Sure!", study_topic="fractions")
    out = engine.step(brain, TurnIn(text="teach me fractions"))
    assert (out.reply, out.start_study, out.progress.mode) == ("Sure!", "fractions", "chat")


def test_begin_opens_with_the_plan_and_part_one():
    brain = ScriptedBrain()
    out = engine.step(brain, TurnIn(begin=True, plan=PLAN))
    assert out.reply == "SAY:open_plan"
    assert (out.progress.mode, out.progress.part) == ("teach", 0)


def test_ready_moves_to_the_quiz_and_asks_the_planned_question_word_for_word():
    brain = ScriptedBrain(say("ready"))
    out = run(brain, Progress(mode="teach"))
    assert out.reply == "Question 1?"
    assert out.progress.mode == "quiz" and brain.said == []  # no model call needed


def test_question_is_asked_through_the_model_when_the_language_changed():
    brain = ScriptedBrain(say("ready"))
    out = run(brain, Progress(mode="teach"), language="hi")
    assert out.reply == "SAY:ask"  # translated by the model; the engine cannot copy it verbatim


def test_passing_all_questions_moves_to_the_next_part_then_finishes():
    brain = ScriptedBrain(say("answer", "correct"), say("answer", "correct"))
    out = run(brain, Progress(mode="quiz"))
    assert out.reply.startswith("SAY:next_question") and out.progress.q == 1
    out = run(brain, out.progress)
    assert out.reply == "SAY:next_part"
    assert (out.progress.mode, out.progress.part, out.progress.q, out.progress.correct) == (
        "teach",
        1,
        0,
        2,
    )

    brain = ScriptedBrain(say("answer", "correct"))
    out = run(brain, Progress(mode="quiz", part=1, q=1, correct=3))
    assert out.reply == "SAY:finish" and out.progress.mode == "done" and out.progress.correct == 4


def test_wrong_answers_get_a_hint_then_a_second_explanation_then_the_answer():
    brain = ScriptedBrain(
        say("answer", "wrong"), say("answer", "wrong"), say("ready"), say("answer", "wrong")
    )
    out = run(brain, Progress(mode="quiz"))
    assert out.reply.startswith("SAY:hint") and (out.progress.mode, out.progress.misses) == (
        "quiz",
        1,
    )
    out = run(brain, out.progress)
    assert out.reply == "SAY:reteach" and out.progress.mode == "teach" and out.progress.misses == 2
    out = run(brain, out.progress)  # "ok": back to the same question
    assert out.reply == "Question 1?" and out.progress.q == 0
    out = run(brain, out.progress)
    assert out.reply.startswith("SAY:reveal") and out.progress.q == 1 and out.progress.misses == 0
    assert out.progress.revealed == ["Tens: Question 1? (answer 1)"]
    assert out.progress.correct == 0  # a given-away answer is not a pass


def test_partly_right_is_not_a_pass():
    out = run(ScriptedBrain(say("answer", "partly")), Progress(mode="quiz"))
    assert out.progress.misses == 1 and out.reply.startswith("SAY:hint")


def test_asking_again_teaches_the_same_part_again_and_keeps_the_place():
    brain = ScriptedBrain(say("again", style="simple"))
    out = run(brain, Progress(mode="quiz", part=1, q=1), text="wait, like I am five")
    assert out.reply == "SAY:reteach" and out.style == "simple"
    assert (out.progress.mode, out.progress.part, out.progress.q) == ("teach", 1, 1)


def test_a_doubt_is_answered_without_losing_the_open_question():
    brain = ScriptedBrain(say("doubt"))
    out = run(brain, Progress(mode="quiz", q=1), text="what is a digit?")
    assert out.reply.startswith("SAY:answer_doubt") and brain.said[0].question == question(2)
    assert (out.progress.mode, out.progress.q) == ("quiz", 1)


def test_skip_gives_the_answer_and_moves_on():
    out = run(ScriptedBrain(say("skip")), Progress(mode="quiz"))
    assert (
        out.reply.startswith("SAY:reveal")
        and out.progress.q == 1
        and len(out.progress.revealed) == 1
    )


def test_stop_ends_with_a_summary():
    out = run(ScriptedBrain(say("stop")), Progress(mode="quiz", correct=2))
    assert out.reply == "SAY:finish" and out.progress.mode == "done"


def test_a_language_request_switches_even_if_the_model_misreads_it():
    brain = ScriptedBrain(say("other"))
    out = run(brain, Progress(mode="teach"), text="explain this in Hindi please")
    assert out.language == "hi" and out.reply == "SAY:reteach"


def test_the_planned_question_is_put_back_if_the_model_leaves_it_out():
    out = run(ScriptedBrain(say("answer", "wrong")), Progress(mode="quiz"))
    assert out.reply == "SAY:hint Question 1?"


def test_a_position_outside_the_plan_is_refused():
    with pytest.raises(engine.LessonError):
        run(ScriptedBrain(), Progress(mode="quiz", part=5))


def test_text_and_history_reach_the_model():
    brain = ScriptedBrain(say("doubt"))
    history = [Message(role="user", content="hi"), Message(role="assistant", content="hello")]
    engine.step(
        brain, TurnIn(text="why?", messages=history, plan=PLAN, progress=Progress(mode="teach"))
    )
    assert brain.said[0].text == "why?"


# --- HTTP ------------------------------------------------------------------------------------


class FakeBrain(ScriptedBrain):
    def plan(self, topic, document, language, style):
        self.planned = (topic, document, language, style)
        return PLAN


@pytest.fixture
def brain():
    fake = FakeBrain(say("ready"))
    app.dependency_overrides[tutor.get_brain] = lambda: fake
    Base.metadata.create_all(db_engine)  # the daily caps are counted in the database
    yield fake
    app.dependency_overrides.clear()
    Base.metadata.drop_all(db_engine)


def post(path, body):
    return TestClient(app).post(f"/api/v1/tutor/{path}", json=body)


def test_plan_needs_a_topic_or_a_document(brain):
    assert post("plan", {}).status_code == 422
    res = post("plan", {"topic": "fractions", "language": "ta"})
    assert res.status_code == 200 and res.json()["title"] == "Tens and ones"
    assert brain.planned[0] == "fractions" and brain.planned[2] == "ta"


def test_plan_accepts_an_attached_file_and_refuses_odd_types(brain):
    doc = {"name": "ch1.pdf", "media_type": "application/pdf", "data": "JVBERi0="}
    assert post("plan", {"document": doc}).status_code == 200
    assert (
        post("plan", {"document": {**doc, "media_type": "application/x-msdownload"}}).status_code
        == 422
    )


def test_turn_runs_a_lesson_step(brain):
    res = post("turn", {"text": "ok", "plan": PLAN.model_dump(), "progress": {"mode": "teach"}})
    assert res.status_code == 200 and res.json()["reply"] == "Question 1?"
    assert res.json()["progress"]["mode"] == "quiz"


def test_turn_with_a_position_outside_the_plan_is_422(brain):
    res = post(
        "turn", {"text": "ok", "plan": PLAN.model_dump(), "progress": {"mode": "quiz", "part": 5}}
    )
    assert res.status_code == 422


def test_rejects_unknown_language_and_huge_text(brain):
    assert post("turn", {"text": "hi", "language": "fr"}).status_code == 422
    assert post("turn", {"text": "x" * 1001}).status_code == 422


def test_daily_cap_stops_the_spending_and_a_plan_costs_five_turns(brain, monkeypatch):
    monkeypatch.setattr(tutor.settings, "tutor_daily_turns", 6)
    assert post("plan", {"topic": "x"}).status_code == 200  # 5 of 6 used
    assert post("turn", {"text": "hi"}).status_code == 200
    assert post("turn", {"text": "hi"}).status_code == 429


def test_speak_without_a_server_voice_says_so(brain):
    app.dependency_overrides[tutor.get_voice] = lambda: None
    assert post("speak", {"text": "Hello", "language": "en"}).status_code == 503


def test_speak_returns_a_wav(brain):
    app.dependency_overrides[tutor.get_voice] = lambda: FakeTTS()
    res = post("speak", {"text": "Hello", "language": "hi"})
    assert res.status_code == 200 and res.headers["content-type"] == "audio/wav"
    assert res.content[:4] == b"RIFF"


def test_one_caller_cannot_use_up_everyones_day(brain, monkeypatch):
    monkeypatch.setattr(tutor.settings, "tutor_ip_daily_turns", 1)
    me, you = {"X-Forwarded-For": "203.0.113.5"}, {"X-Forwarded-For": "198.51.100.7"}
    client = TestClient(app)
    turn = {"text": "hi"}
    assert client.post("/api/v1/tutor/turn", json=turn, headers=me).status_code == 200
    assert client.post("/api/v1/tutor/turn", json=turn, headers=me).status_code == 429
    assert client.post("/api/v1/tutor/turn", json=turn, headers=you).status_code == 200


def test_plans_from_files_have_their_own_small_cap(brain, monkeypatch):
    monkeypatch.setattr(tutor.settings, "tutor_ip_daily_file_plans", 1)
    doc = {"name": "ch1.pdf", "media_type": "application/pdf", "data": "JVBERi0="}
    assert post("plan", {"document": doc}).status_code == 200
    assert post("plan", {"document": doc}).status_code == 429
    assert post("plan", {"topic": "fractions"}).status_code == 200  # a typed topic still works


def test_an_oversized_body_is_refused_before_it_is_read(brain):
    huge = "x" * 1_100_000
    assert post("turn", {"text": huge}).status_code == 413
