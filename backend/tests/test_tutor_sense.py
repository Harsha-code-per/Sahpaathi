"""The perception agents and their LangGraph orchestrator, and how a signal reaches the lesson."""

import json

import pytest
from fastapi.testclient import TestClient
from test_api_tutor import PLAN, ScriptedBrain

from app.main import app
from app.tutor import engine, sense
from app.tutor.models import Progress, TurnIn
from app.tutor.sense import agents, graph
from app.tutor.sense.schema import Audio, Context, Face, Pose, Sample


def window(n=8, **parts) -> sense.SenseIn:
    """n seconds where every sample carries the same face / pose / audio."""
    ctx = parts.pop("context", {})
    samples = [Sample(t=i, **parts) for i in range(n)]
    return sense.SenseIn(samples=samples, context=ctx)


def test_a_calm_learner_is_focused_and_nothing_is_suggested():
    out = sense.analyse(window(face=Face(), pose=Pose(), audio=Audio()))
    assert out.state == "focused" and not out.check_in and out.reasons == []
    assert set(out.features) == set(sense.FEATURES)


def test_a_lowered_brow_for_several_seconds_reads_as_confused():
    out = sense.analyse(window(face=Face(brow_down=0.35, eye_squint=0.3)))
    assert out.state == "confused" and out.check_in
    assert "brow stayed lowered or squinting" in out.reasons


def test_one_second_of_a_grimace_never_triggers_anything():
    out = sense.analyse(window(n=3, face=Face(brow_down=0.6, eye_squint=0.5)))
    assert out.state == "confused" and not out.check_in  # seen, but not enough evidence yet


def test_a_yawn_and_heavy_eyes_read_as_tired():
    out = sense.analyse(window(face=Face(eye_closure=0.5, jaw_open=0.4), pose=Pose(slouch=0.6)))
    assert out.state == "tired" and out.check_in


def test_looking_away_reads_as_distracted_but_an_empty_frame_makes_no_claim():
    assert sense.analyse(window(face=Face(gaze_away=0.7))).state == "distracted"
    gone = sense.analyse(window(face=None, pose=None))
    assert gone.state == "focused" and not gone.check_in  # nothing measured, so nothing is claimed
    assert agents.face_agent(window(face=None).samples, Context()).weight == 0


def test_background_noise_reads_as_noisy_and_the_teachers_own_voice_is_discounted():
    loud = Audio(level=0.8, noise=0.6, speaking=False)
    quiet_teacher = sense.analyse(window(audio=loud))
    assert quiet_teacher.state == "noisy" and quiet_teacher.check_in
    own_voice = agents.audio_agent(window(audio=loud).samples, Context(teacher_speaking=True))
    assert own_voice.weight < 1  # the microphone also hears the teacher
    speaking = window(audio=Audio(level=0.9, noise=0.9, speaking=True))
    assert (
        agents.audio_agent(speaking.samples, Context()).weight == 0
    )  # the learner is talking: no read


def test_missing_answers_make_a_mild_face_signal_stronger():
    face = Face(brow_down=0.12, eye_squint=0.1)
    alone = sense.analyse(window(face=face))
    with_misses = sense.analyse(
        window(face=face, context=Context(mode="quiz", misses=2, latency_s=12))
    )
    assert with_misses.scores["confused"] > alone.scores["confused"]


def test_agents_agree_more_than_one_alone():
    face_only = sense.analyse(window(face=Face(brow_down=0.18)))
    both = sense.analyse(window(face=Face(brow_down=0.18), pose=Pose(hand_to_face=0.8)))
    assert both.scores["confused"] > face_only.scores["confused"]


def test_the_graph_runs_the_four_agents_and_one_orchestrator():
    nodes = set(graph.GRAPH.get_graph().nodes)
    assert {"face", "posture", "audio", "response", "orchestrator"} <= nodes


def test_trained_weights_replace_the_hand_set_rules(tmp_path, monkeypatch):
    path = tmp_path / "weights.json"
    path.write_text(json.dumps({"models": {"confused": {"bias": -4, "coef": {"brow_down": 20}}}}))
    monkeypatch.setattr(graph, "WEIGHTS_FILE", path)
    monkeypatch.setattr(graph, "load_weights", lambda p=path: graph.json.loads(p.read_text()))
    low = sense.analyse(window(face=Face(brow_down=0.05)))
    high = sense.analyse(window(face=Face(brow_down=0.4)))
    assert low.scores["confused"] < 0.5 < high.scores["confused"]  # logistic: sigmoid(-4 + 20 * x)


def test_a_missing_weights_file_means_the_rules_are_used(tmp_path):
    assert graph.load_weights(tmp_path / "nope.json") is None


def test_payload_limits_are_enforced():
    with pytest.raises(ValueError):
        sense.SenseIn(samples=[])
    with pytest.raises(ValueError):
        Face(brow_down=2)


def test_the_http_endpoint_returns_an_insight_and_stores_nothing():
    body = window(face=Face(brow_down=0.35, eye_squint=0.3)).model_dump()
    res = TestClient(app).post("/api/v1/tutor/sense", json=body)
    assert (
        res.status_code == 200
        and res.json()["state"] == "confused"
        and res.json()["check_in"] is True
    )


# --- how a signal reaches the lesson ------------------------------------------------------------


def run_signal(signal, mode="quiz", **kw):
    brain = ScriptedBrain()
    turn = TurnIn(
        plan=PLAN, progress=Progress(mode=mode, q=1), signal=signal, reasons=["brow lowered"], **kw
    )
    return brain, engine.step(brain, turn)


@pytest.mark.parametrize("signal", ["confused", "distracted", "noisy", "uncomfortable"])
def test_a_signal_makes_the_teacher_check_in_without_moving_the_lesson(signal):
    brain, out = run_signal(signal)
    assert out.reply.startswith("SAY:check_in")
    assert (brain.said[0].kind, brain.said[0].text) == (signal, "brow lowered")
    assert (out.progress.mode, out.progress.q) == ("quiz", 1)  # nothing is graded or advanced


def test_a_check_in_asks_only_how_they_are_and_the_question_waits():
    brain, out = run_signal("confused", mode="quiz")
    assert (
        brain.said[0].question is None and out.reply == "SAY:check_in"
    )  # no second question stacked on top
    assert out.progress.q == 1  # the open question is still the open question


def test_a_tired_signal_offers_a_break_and_remembers_the_place():
    brain, out = run_signal("tired")
    assert out.reply.startswith("SAY:offer_break")
    assert (out.progress.mode, out.progress.resume, out.progress.q) == ("break", "quiz", 1)


def test_a_signal_outside_a_lesson_moment_is_refused():
    with pytest.raises(engine.LessonError):
        run_signal("confused", mode="break")
