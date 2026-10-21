"""Breaks and games: when the teacher offers one, how each activity is scored, and how the lesson
resumes exactly where it stopped."""

import random

import pytest
from test_api_tutor import PLAN, ScriptedBrain, question, run, say

from app.tutor import activities, engine
from app.tutor.models import Game, Progress, TurnIn


def rng() -> random.Random:
    return random.Random(7)


def test_maths_questions_are_generated_with_correct_answers():
    for style in ("normal", "simple"):
        qs = activities.maths(rng(), style)
        assert len(qs) == 3
        for q in qs:
            x, sign, y = q.ask.removeprefix("What is ").removesuffix("?").split()
            assert str(int(x) + int(y) if sign == "plus" else int(x) - int(y)) == q.answer
            assert int(q.answer) >= 0 and (style == "normal" or int(x) <= 10)


def test_pattern_questions_continue_the_pattern():
    for q in activities.pattern(rng(), "normal"):
        nums = [int(n) for n in q.ask.split(", and then")[0].split(", ")]
        assert nums[-1] + (nums[1] - nums[0]) == int(q.answer)


def test_numeric_verdict_compares_numbers_and_defers_when_there_is_none():
    assert activities.numeric_verdict("it is 12", "12") is True
    assert activities.numeric_verdict("maybe 13?", "12") is False
    assert activities.numeric_verdict("twelve", "12") is None
    assert activities.numeric_verdict("a clock", "a clock") is None


def test_saying_you_are_tired_offers_a_break_and_remembers_the_place():
    out = run(ScriptedBrain(say("break")), Progress(mode="quiz", q=1), text="I am so tired")
    assert out.reply.startswith("SAY:offer_break")
    assert (out.progress.mode, out.progress.resume, out.progress.q) == ("break", "quiz", 1)


def test_tiredness_is_caught_in_code_even_if_the_model_calls_it_chat():
    out = run(ScriptedBrain(say("other")), Progress(mode="teach"), text="I am bored, need a break")
    assert out.progress.mode == "break" and out.progress.resume == "teach"


def test_a_break_is_offered_at_the_next_pause_after_enough_turns():
    brain = ScriptedBrain(say("answer", "correct"))
    out = run(brain, Progress(mode="quiz", q=0, since_break=engine.BREAK_EVERY_TURNS - 1))
    assert out.progress.mode == "break" and out.progress.resume == "quiz" and out.progress.q == 1
    assert brain.said[-1].action == "offer_break"


def test_a_break_is_offered_after_two_finished_parts_and_the_next_part_waits():
    out = run(
        ScriptedBrain(say("answer", "correct")), Progress(mode="quiz", q=1, parts_since_break=1)
    )
    assert (out.progress.mode, out.progress.resume, out.progress.part) == ("break", "teach", 1)


def test_no_break_is_offered_while_it_is_not_due():
    out = run(ScriptedBrain(say("answer", "correct")), Progress(mode="quiz", since_break=3))
    assert out.progress.mode == "quiz"


def test_nothing_interrupts_the_very_end_of_the_lesson():
    prog = Progress(mode="quiz", part=1, q=1, since_break=50)
    assert run(ScriptedBrain(say("answer", "correct")), prog).progress.mode == "done"


def test_going_back_from_the_break_menu_resumes_the_exact_question():
    start = Progress(mode="break", resume="quiz", q=1, since_break=12, parts_since_break=2)
    out = run(ScriptedBrain(say("ready")), start, text="back to the lesson")
    assert out.reply == "SAY:resume_quiz Question 2?"  # the planned question is put back by code
    assert (out.progress.mode, out.progress.q, out.progress.since_break) == ("quiz", 1, 0)
    assert out.progress.resume is None and out.progress.parts_since_break == 0


def test_picking_a_riddle_asks_it_and_a_right_answer_returns_to_the_lesson():
    brain = ScriptedBrain(say("break", activity="riddle"), say("answer", "correct"))
    out = run(brain, Progress(mode="break", resume="teach", part=1), text="a riddle please")
    assert out.progress.mode == "game" and out.progress.game.kind == "riddle"
    assert out.reply.endswith("What has hands but cannot clap?")
    out = run(brain, out.progress, text="a clock")
    assert out.reply.startswith("SAY:game_feedback")
    assert brain.said[-1].then.action == "game_result"
    assert (out.progress.mode, out.progress.part, out.progress.game) == ("teach", 1, None)


def test_the_activity_is_found_in_code_if_the_model_misses_it():
    prog = Progress(mode="break", resume="teach")
    out = run(ScriptedBrain(say("other")), prog, text="give me a riddle")
    assert out.progress.mode == "game" and out.progress.game.kind == "riddle"


def test_maths_game_is_scored_by_code_over_three_rounds_then_resumes():
    brain = ScriptedBrain(say("break", activity="maths"))
    start = Progress(mode="break", resume="quiz", q=1)
    out = engine.step(brain, TurnIn(text="quick maths", plan=PLAN, progress=start), rng())
    game = out.progress.game
    assert game.kind == "maths" and game.language == "en" and len(game.questions) == 3
    prog = out.progress
    for i, q in enumerate(game.questions):
        brain.judgements.append(say("answer", "wrong"))  # the model says wrong; the numbers decide
        out = run(brain, prog, text=f"it is {q.answer}")
        prog = out.progress
        assert (prog.mode == "game") == (i < 2)
    assert prog.mode == "quiz" and prog.q == 1 and prog.game is None
    assert brain.said[-1].then.action == "game_result" and brain.said[-1].then.correct == 3


def test_a_wrong_game_answer_gets_a_hint_then_the_answer():
    brain = ScriptedBrain(say("break", activity="pattern"))
    start = Progress(mode="break", resume="teach")
    out = engine.step(brain, TurnIn(text="pattern", plan=PLAN, progress=start), rng())
    brain.judgements += [say("answer", "wrong"), say("answer", "wrong")]
    out = run(brain, out.progress, text="999")
    assert brain.said[-1].action == "game_hint" and out.progress.game.tries == 1
    out = run(brain, out.progress, text="998")
    assert brain.said[-1].action == "game_feedback" and brain.said[-1].correct == 0
    assert out.progress.game.round == 1 and out.progress.game.score == 0


@pytest.mark.parametrize("kind", ["memory", "stretch"])
def test_the_memory_game_and_stretch_end_when_the_student_is_done(kind):
    brain = ScriptedBrain(say("break", activity=kind), say("ready"))
    out = run(brain, Progress(mode="break", resume="teach"), text=kind)
    assert out.progress.mode == "game" and brain.said[-1].action == "game_intro"
    out = run(brain, out.progress, text="done")
    assert out.progress.mode == "teach" and brain.said[-1].action == "game_result"


def test_stopping_in_a_game_ends_the_lesson():
    out = run(ScriptedBrain(say("stop")), Progress(mode="game", game=Game(kind="memory")))
    assert out.progress.mode == "done" and out.progress.game is None


def test_a_tampered_game_position_is_refused():
    bad = Progress(mode="game", game=Game(kind="maths", questions=[question(1)], round=1))
    with pytest.raises(engine.LessonError):
        run(ScriptedBrain(), bad)
