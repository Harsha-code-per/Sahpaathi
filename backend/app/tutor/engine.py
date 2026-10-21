"""The teacher's rules, in code. Claude only finds the words; this decides what happens next.

A lesson is a plan of parts, one concept each. Every part goes: teach it, ask its questions, and move
on only when they are answered. A wrong answer earns a hint, then a simpler second explanation, and on
the third miss the answer is given and noted for revision, so nobody gets stuck. At any point the student
can ask a doubt, ask to hear it again, or switch language or style, and the lesson holds its place.

Learning is tiring, so the teacher also watches the clock: after enough turns or parts, or when the
student says they are tired or bored, it offers a short break (a riddle, quick maths, a number pattern,
a memory game on screen, or a stretch), scores it, and then returns to exactly where the lesson stopped.

`step` is pure apart from calls to the `Brain`, so every rule is testable with a scripted brain.
"""

import random
from dataclasses import dataclass
from typing import Protocol

from app.tutor import activities
from app.tutor.models import (
    Activity,
    ChatResult,
    Game,
    Judgement,
    Lang,
    Message,
    Part,
    Plan,
    Progress,
    Question,
    Style,
    TurnIn,
    TurnOut,
)

# Wrong answers on one question before the answer is given away (1: hint, 2: teach again, 3: reveal).
MAX_MISSES = 3
# A break is offered at the next natural pause after this many student turns, or finished parts.
BREAK_EVERY_TURNS = 10
BREAK_EVERY_PARTS = 2
GAME_TRIES = 2  # guesses per game question before the answer is given


@dataclass
class Directive:
    """What the next spoken turn must do. The brain turns it into words in the student's language."""

    action: str
    plan: Plan
    part_no: int  # 1-based, for "Part 2 of 4"
    question: Question | None = None
    qlang: Lang | None = None  # language `question` is written in (the plan's, unless a game's)
    text: str = ""  # what the student said, for doubts and redirects
    correct: int = 0
    total: int = 0
    kind: str = ""  # the break activity, for game turns
    revealed: tuple[str, ...] = ()
    then: "Directive | None" = None  # what follows: a reveal's next step, a game's way back

    @property
    def part(self) -> Part:
        return self.plan.parts[self.part_no - 1]


class Brain(Protocol):
    def chat(self, history: list[Message], language: Lang, style: Style) -> ChatResult: ...

    def judge(
        self,
        history: list[Message],
        text: str,
        mode: str,
        part: Part,
        question: Question | None,
        language: Lang,
    ) -> Judgement: ...

    def say(
        self, directive: Directive, history: list[Message], language: Lang, style: Style
    ) -> str: ...

    def riddle(self, plan: Plan, part: Part, language: Lang, style: Style) -> Question: ...


class LessonError(ValueError):
    """The plan and the progress do not fit together (a tampered or stale request)."""


def _say(brain: Brain, d: Directive, history: list[Message], lang: Lang, style: Style) -> str:
    """Speak a directive, but never let the model change a question: when the lesson is in the language
    the question was written in, the question is copied in by code."""
    ask = d
    while (
        ask.then is not None
    ):  # a reveal or a game result ends by asking or teaching something new
        ask = ask.then
    q, written = ask.question, ask.qlang or d.plan.language
    if d.action == "ask" and q and lang == written:
        return q.ask  # no model call at all: instant, and exactly the planned question
    reply = brain.say(d, history, lang, style)
    if q and lang == written and q.ask not in reply:
        reply = f"{reply.rstrip()} {q.ask}"
    return reply


# Words that ask for something. Code checks them too, so a request never depends on the model's mood.
LANGUAGE_WORDS: dict[Lang, tuple[str, ...]] = {
    "hi": ("hindi", "हिंदी", "हिन्दी"),
    "ta": ("tamil", "தமிழ்"),
    "or": ("odia", "oriya", "ଓଡ଼ିଆ"),
    "en": ("english", "अंग्रेजी", "ஆங்கிலம்", "ଇଂରାଜୀ"),
}
ACTIVITY_WORDS: dict[Activity, tuple[str, ...]] = {
    "riddle": ("riddle", "paheli", "पहेली", "புதிர்", "ପ୍ରହେଳିକା"),
    "pattern": ("pattern", "sequence"),
    "maths": ("maths", "math", "sums", "गणित", "கணக்கு", "ଗଣିତ"),
    "stretch": ("stretch", "exercise", "walk around", "व्यायाम"),
    "memory": ("memory", "game", "puzzle", "cards", "खेल", "விளையாட்டு", "ଖେଳ"),
}
BREAK_WORDS = (
    "tired",
    "bored",
    "break",
    "rest",
    "sleepy",
    "थक",
    "ब्रेक",
    "बोर",
    "சோர்",
    "இடைவேளை",
    "ବିରତି",
)


def _find(text: str, table: dict) -> str | None:
    low = text.lower()
    if len(low) > 120:  # a long message is an answer or a doubt, not a request
        return None
    for key, words in table.items():
        if any(w in low for w in words):
            return key
    return None


def _wants_break(text: str) -> bool:
    low = text.lower()
    return len(low) <= 120 and any(w in low for w in BREAK_WORDS)


def _history(turn: TurnIn) -> list[Message]:
    return [*turn.messages, *([Message(role="user", content=turn.text)] if turn.text else [])]


def _due_break(p: Progress) -> bool:
    return p.since_break >= BREAK_EVERY_TURNS or p.parts_since_break >= BREAK_EVERY_PARTS


def step(brain: Brain, turn: TurnIn, rng: random.Random | None = None) -> TurnOut:
    lang, style = turn.language, turn.style
    plan, p = turn.plan, turn.progress.model_copy(deep=True)
    history = _history(turn)
    rng = rng or random.Random()

    if turn.begin and plan is not None:
        return TurnOut(
            reply=_say(brain, Directive("open_plan", plan, 1), history, lang, style),
            progress=Progress(mode="teach"),
            language=lang,
            style=style,
        )

    if p.mode in ("chat", "done") or plan is None:
        if not turn.text:
            raise LessonError("Say something to start.")
        res = brain.chat(history, lang, style)
        return TurnOut(
            reply=res.reply,
            progress=Progress(),
            language=lang,
            style=style,
            start_study=res.study_topic,
        )

    if p.part >= len(plan.parts) or p.q >= len(plan.parts[p.part].quiz):
        raise LessonError("The lesson position does not match the plan.")
    if p.mode == "game" and (
        p.game is None or (p.game.questions and p.game.round >= len(p.game.questions))
    ):
        raise LessonError("The break game does not match the progress.")
    part = plan.parts[p.part]

    def d(action: str, **kw) -> Directive:
        return Directive(action, plan, p.part + 1, **kw)

    def speak(action: str, **kw) -> str:
        return _say(brain, d(action, **kw), history, lang, style)

    if turn.signal and not turn.text:  # the perception agents suggest a gentle check-in
        if p.mode not in ("teach", "quiz"):
            raise LessonError("There is no lesson moment to check in on.")
        if turn.signal == "tired":  # a tired learner is offered a break, like one who says so
            p.resume, p.mode = p.mode, "break"  # type: ignore[assignment]
            reply = speak("offer_break", text="you look a little tired")
        else:
            # Only the check-in: the open question comes back after they answer it.
            reply = speak("check_in", kind=turn.signal, text="; ".join(turn.reasons))
        return TurnOut(reply=reply, progress=p, language=lang, style=style, intent=None)
    if not turn.text:
        raise LessonError("Say something to continue.")

    question: Question | None = None
    if p.mode == "quiz":
        question = part.quiz[p.q]
    elif p.mode == "game" and p.game and p.game.round < len(p.game.questions):
        question = p.game.questions[p.game.round]

    j = brain.judge(history, turn.text, p.mode, part, question, lang)
    asked = _find(turn.text, LANGUAGE_WORDS)
    if asked and asked != lang and j.intent in ("other", "again") and j.language is None:
        j = j.model_copy(update={"intent": "again", "language": asked})
    if p.mode in ("teach", "quiz") and j.intent in ("other", "again") and _wants_break(turn.text):
        j = j.model_copy(update={"intent": "break"})
    lang, style = j.language or lang, j.style or style  # a request to switch applies right away
    intent = j.intent
    activity = j.activity or _find(turn.text, ACTIVITY_WORDS)
    if p.mode in ("teach", "quiz"):
        p.since_break += 1

    def out(reply: str) -> TurnOut:
        return TurnOut(reply=reply, progress=p, language=lang, style=style, intent=intent)

    if intent == "stop":
        p.mode, p.game = "done", None
        return out(speak("finish", correct=p.correct, revealed=tuple(p.revealed)))

    if p.mode == "break":  # the break was offered: pick an activity, or go back
        if activity and intent in ("break", "other", "answer"):
            return out(_start_game(brain, plan, p, activity, history, lang, style, rng))
        if intent == "doubt":
            return out(speak("answer_doubt", text=turn.text))
        return out(_say(brain, _resume(plan, p), history, lang, style))

    if p.mode == "game":
        return out(_play(brain, plan, p, j, activity, turn.text, history, lang, style, rng))

    if intent == "break":  # "I am tired": offer a break now and remember where we were
        p.resume, p.mode = p.mode, "break"  # type: ignore[assignment]
        return out(speak("offer_break", text=turn.text))

    if intent == "again":  # "wait, teach me again": same part, a new way, then back to the question
        p.mode = "teach"
        reply = speak("reteach")
    elif intent == "doubt":
        reply = speak("answer_doubt", text=turn.text, question=question)
    elif p.mode == "teach":  # ready, or anything else: the explanation is done, check it
        p.mode = "quiz"
        reply = speak("ask", question=part.quiz[p.q])
    elif intent == "answer" and j.verdict == "correct":
        p.correct += 1
        reply = _next(brain, plan, p, history, lang, style)
    elif intent in ("answer", "skip"):
        p.misses += 1 if intent == "answer" else MAX_MISSES
        if p.misses >= MAX_MISSES:
            assert question is not None
            p.revealed.append(f"{part.title}: {question.ask} ({question.answer})")
            reply = _next(brain, plan, p, history, lang, style, reveal=question, said=turn.text)
        elif p.misses == 1:
            reply = speak("hint", question=question, text=turn.text)
        else:  # second miss: teach it again, simpler, then ask again
            p.mode = "teach"
            reply = speak("reteach", text=turn.text)
    else:  # something unrelated while a question is open
        reply = speak("redirect", text=turn.text, question=question)
    return out(reply)


def _next(
    brain: Brain,
    plan: Plan,
    p: Progress,
    history: list[Message],
    lang: Lang,
    style: Style,
    reveal: Question | None = None,
    said: str = "",
) -> str:
    """Move past the question just finished (passed or given away) and say what comes next."""
    done = Directive("", plan, p.part + 1)
    p.q += 1
    p.misses = 0
    if p.q < len(plan.parts[p.part].quiz):
        follow = Directive("next_question", plan, p.part + 1, question=plan.parts[p.part].quiz[p.q])
        resume = "quiz"
    elif p.part + 1 < len(plan.parts):
        p.part, p.q, p.mode = p.part + 1, 0, "teach"
        p.parts_since_break += 1
        follow = Directive("next_part", plan, p.part + 1)
        resume = "teach"
    else:
        p.mode = "done"
        follow = Directive(
            "finish", plan, p.part + 1, correct=p.correct, revealed=tuple(p.revealed)
        )
        resume = None
    if resume and _due_break(p):  # a natural pause, and they have worked a while: offer a break
        p.resume, p.mode = resume, "break"  # type: ignore[assignment]
        follow = Directive("offer_break", plan, p.part + 1, text="", then=None)
    if reveal is not None:
        d = Directive("reveal", plan, done.part_no, question=reveal, text=said, then=follow)
    else:
        d = follow
    return _say(brain, d, history, lang, style)


def _resume(plan: Plan, p: Progress) -> Directive:
    """End a break and return to the exact place the lesson stopped."""
    mode = p.resume or "teach"
    p.mode, p.resume, p.game = mode, None, None
    p.since_break = p.parts_since_break = 0
    part = plan.parts[p.part]
    if mode == "quiz":
        return Directive("resume_quiz", plan, p.part + 1, question=part.quiz[p.q])
    return Directive("resume_part", plan, p.part + 1)


def _start_game(
    brain: Brain,
    plan: Plan,
    p: Progress,
    kind: Activity,
    history: list[Message],
    lang: Lang,
    style: Style,
    rng: random.Random,
) -> str:
    part = plan.parts[p.part]
    if kind == "riddle":
        questions, written = [brain.riddle(plan, part, lang, style)], lang
    else:
        questions, written = activities.make(kind, rng, style), "en"  # sums and patterns are digits
    p.mode, p.game = "game", Game(kind=kind, language=written, questions=questions)
    first = questions[0] if questions else None
    d = Directive(
        "game_ask" if first else "game_intro",
        plan,
        p.part + 1,
        question=first,
        qlang=written,
        kind=kind,
        total=len(questions),
    )
    return _say(brain, d, history, lang, style)


def _play(
    brain: Brain,
    plan: Plan,
    p: Progress,
    j: Judgement,
    activity: Activity | None,
    text: str,
    history: list[Message],
    lang: Lang,
    style: Style,
    rng: random.Random,
) -> str:
    g = p.game
    assert g is not None
    back = j.intent == "ready" or g.kind in (
        "memory",
        "stretch",
    )  # nothing to answer: they are done
    if activity and activity != g.kind and j.intent in ("break", "other") and not back:
        return _start_game(brain, plan, p, activity, history, lang, style, rng)  # a different game
    if back:
        done = Directive(
            "game_result",
            plan,
            p.part + 1,
            kind=g.kind,
            correct=g.score,
            total=len(g.questions),
            then=_resume(plan, p),
        )
        return _say(brain, done, history, lang, style)
    q = g.questions[g.round]
    ask = Directive(
        "game_ask",
        plan,
        p.part + 1,
        question=q,
        qlang=g.language,
        kind=g.kind,
        total=len(g.questions),
    )
    if j.intent in ("again", "doubt", "other"):  # repeat the question
        return _say(brain, ask, history, lang, style)

    right = None if j.intent == "skip" else activities.numeric_verdict(text, q.answer)
    if right is None:
        right = j.intent == "answer" and j.verdict == "correct"
    if not right and j.intent == "answer" and g.tries + 1 < GAME_TRIES:
        g.tries += 1
        hint = Directive("game_hint", plan, p.part + 1, question=q, qlang=g.language, kind=g.kind)
        return _say(brain, hint, history, lang, style)

    g.score += 1 if right else 0
    g.round, g.tries = g.round + 1, 0
    feedback = Directive(
        "game_feedback",
        plan,
        p.part + 1,
        question=q,
        qlang=g.language,
        kind=g.kind,
        correct=int(right),
    )
    if g.round < len(g.questions):
        nxt = g.questions[g.round]
        feedback.then = Directive(
            "game_ask",
            plan,
            p.part + 1,
            question=nxt,
            qlang=g.language,
            kind=g.kind,
            total=len(g.questions),
        )
    else:
        feedback.then = Directive(
            "game_result",
            plan,
            p.part + 1,
            kind=g.kind,
            correct=g.score,
            total=len(g.questions),
            then=_resume(plan, p),
        )
    return _say(brain, feedback, history, lang, style)
