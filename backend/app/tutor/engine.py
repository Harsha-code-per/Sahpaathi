"""The teacher's rules, in code. Claude only finds the words; this decides what happens next.

A lesson is a plan of parts, one concept each. Every part goes: teach it, ask its questions, and move
on only when they are answered. A wrong answer earns a hint, then a simpler second explanation, and on
the third miss the answer is given and noted for revision, so nobody gets stuck. At any point the student
can ask a doubt, ask to hear it again, or switch language or style, and the lesson holds its place.

`step` is pure apart from calls to the `Brain`, so every rule is testable with a scripted brain.
"""

from dataclasses import dataclass
from typing import Protocol

from app.tutor.models import (
    ChatResult,
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


@dataclass
class Directive:
    """What the next spoken turn must do. The brain turns it into words in the student's language."""

    action: str  # open_plan reteach ask hint next_question next_part answer_doubt reveal finish redirect
    plan: Plan
    part_no: int  # 1-based, for "Part 2 of 4"
    question: Question | None = None
    text: str = ""  # what the student said, for doubts and redirects
    correct: int = 0
    revealed: tuple[str, ...] = ()
    then: "Directive | None" = None  # what follows a reveal

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


class LessonError(ValueError):
    """The plan and the progress do not fit together (a tampered or stale request)."""


def _say(brain: Brain, d: Directive, history: list[Message], lang: Lang, style: Style) -> str:
    """Speak a directive, but never let the model change a quiz question: when the lesson is in the
    language the questions were written in, the question is copied in by code."""
    same = lang == d.plan.language
    if d.action == "ask" and d.question and same:
        return d.question.ask  # no model call at all: instant, and exactly the planned question
    reply = brain.say(d, history, lang, style)
    must = d.question  # the question this turn has to put to the student
    if d.action == "reveal":
        must = d.then.question if d.then and d.then.action == "next_question" else None
    if must and same and must.ask not in reply:
        reply = f"{reply.rstrip()} {must.ask}"
    return reply


# Words that ask for a language. Code checks them too, so a switch never depends on the model's mood.
LANGUAGE_WORDS: dict[Lang, tuple[str, ...]] = {
    "hi": ("hindi", "हिंदी", "हिन्दी"),
    "ta": ("tamil", "தமிழ்"),
    "or": ("odia", "oriya", "ଓଡ଼ିଆ"),
    "en": ("english", "अंग्रेजी", "ஆங்கிலம்", "ଇଂରାଜୀ"),
}


def _asked_language(text: str) -> Lang | None:
    low = text.lower()
    if len(low) > 120:  # a long message is an answer or a doubt, not a request
        return None
    for code, words in LANGUAGE_WORDS.items():
        if any(w in low for w in words):
            return code
    return None


def _history(turn: TurnIn) -> list[Message]:
    return [*turn.messages, *([Message(role="user", content=turn.text)] if turn.text else [])]


def step(brain: Brain, turn: TurnIn) -> TurnOut:
    lang, style = turn.language, turn.style
    plan, p = turn.plan, turn.progress.model_copy(deep=True)
    history = _history(turn)

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

    def speak(action: str, **kw) -> str:
        return _say(brain, Directive(action, plan, p.part + 1, **kw), history, lang, style)

    if not turn.text:
        raise LessonError("Say something to continue.")

    part = plan.parts[p.part]
    question = part.quiz[p.q] if p.mode == "quiz" else None
    j = brain.judge(history, turn.text, p.mode, part, question, lang)
    asked = _asked_language(turn.text)
    if asked and asked != lang and j.intent in ("other", "again") and j.language is None:
        j = j.model_copy(update={"intent": "again", "language": asked})
    lang, style = j.language or lang, j.style or style  # a request to switch applies right away
    intent = j.intent

    if intent == "stop":
        p.mode = "done"
        reply = speak("finish", correct=p.correct, revealed=tuple(p.revealed))
        return TurnOut(reply=reply, progress=p, language=lang, style=style, intent=intent)

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
    return TurnOut(reply=reply, progress=p, language=lang, style=style, intent=intent)


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
    elif p.part + 1 < len(plan.parts):
        p.part, p.q, p.mode = p.part + 1, 0, "teach"
        follow = Directive("next_part", plan, p.part + 1)
    else:
        p.mode = "done"
        follow = Directive(
            "finish", plan, p.part + 1, correct=p.correct, revealed=tuple(p.revealed)
        )
    if reveal is not None:
        d = Directive("reveal", plan, done.part_no, question=reveal, text=said, then=follow)
    else:
        d = follow
    return _say(brain, d, history, lang, style)
