"""Claude behind the tutor: makes the plan, reads what the student means, and phrases each turn.

The rules about what happens next live in engine.py. Here Claude only (a) analyses material into a
plan, (b) classifies a student message into an intent and verdict, and (c) says the directive it is
handed, in the student's language, like a teacher sitting beside them.
"""

import base64
import logging
from typing import TypeVar

import anthropic
from pydantic import BaseModel

from app.tutor.engine import Directive
from app.tutor.models import (
    LANGUAGES,
    ChatResult,
    Document,
    Judgement,
    Lang,
    Message,
    Part,
    Plan,
    Question,
    Style,
)

log = logging.getLogger(__name__)

PLAN_MODEL = "claude-sonnet-5-5"  # once per lesson: worth the better analysis
TALK_MODEL = "claude-haiku-5-5"  # every spoken turn: must answer in about a second
# Both models answer straight away, but each names "no hidden thinking" differently.
NO_THINKING = {PLAN_MODEL: {"type": "between_tools"}, TALK_MODEL: {"type": "disabled"}}
T = TypeVar("T", bound=BaseModel)

PERSONA = (
    "You are Sahpaathi, a warm, patient teacher sitting right beside one learner in India, teaching by "
    "talking, one to one. Your words are read aloud: short sentences, plain words, no markdown, no "
    "bullet points, no emojis, no headings, and never read out symbols such as asterisks. Use things "
    "the learner can see or touch (seeds, pebbles, rotis, coins, buses). Maths must be exactly right: "
    "work each sum through before you say it. Stay a teacher: decline anything unsafe or unrelated to "
    "learning and never ask for personal details (school, address, phone). If a child seems upset or in "
    "danger, gently say to talk to a trusted adult such as a parent or teacher."
)

STYLE = {
    "normal": "Speak like a kind teacher talking to a student.",
    "simple": (
        "The learner wants it very simple, like they are five years old with no previous knowledge: "
        "one tiny idea at a time, a concrete picture or tiny story, no jargon."
    ),
}


def _language(language: str) -> str:
    return (
        f"Speak ONLY in {LANGUAGES[language]} (numerals and a few well-known English words are fine). "
        "Always write it in the language's own script (Devanagari for Hindi, Tamil script for Tamil, "
        "Odia script for Odia), never in English letters. Switch only if the learner asks, and then "
        "keep to the new language."
    )


def _transcript(history: list[Message], limit: int = 8) -> list[dict]:
    """The last turns, starting with the learner as the API requires."""
    msgs = [m.model_dump() for m in history[-limit:]]
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    return msgs


def _spec(part: Part, n: int, total: int) -> str:
    points = "\n".join(f"- {p}" for p in part.points)
    return (
        f"Part {n} of {total}: {part.title}. Teach ONLY this one concept, making these points in "
        f"order, simply:\n{points}\nUse this example: {part.example}\n"
        "At most 8 short sentences, and then stop."
    )


INVITE = (
    "End by inviting the learner to tell you when they are ready for a quick question, or to ask "
    "anything they did not get."
)


def _instruction(d: Directive) -> str:
    n, total = d.part_no, len(d.plan.parts)
    q = d.question
    match d.action:
        case "open_plan":
            plan = ", ".join(f"{i}. {p.title}" for i, p in enumerate(d.plan.parts, 1))
            return (
                f"Greet them in one short sentence. Then tell the plan for '{d.plan.title}': {total} "
                f"parts ({plan}), about {d.plan.total_minutes()} minutes in all, and that you will "
                "check each part with a quick question before moving on. Then teach part 1 now. "
                f"{_spec(d.part, 1, total)}\n{INVITE}"
            )
        case "reteach":
            return (
                "The learner did not follow, or asked to hear it again. Do NOT repeat your earlier "
                "words. Explain the same concept again in a different, simpler way, slower, with a "
                "new everyday example. Say you will go step by step. If the learner asked for a "
                f"different language or style, use it.\n{_spec(d.part, n, total)}\n{INVITE}"
            )
        case "ask":
            assert q
            return f"Ask exactly this question, word for word if the language is unchanged, and nothing after it: {q.ask}"
        case "hint":
            assert q
            return (
                "The learner's answer was not right yet. Say so kindly in one short sentence without "
                f"giving the answer. Give this hint: {q.hint}\nThen ask the same question again: {q.ask}"
            )
        case "next_question":
            assert q
            return (
                "Praise the correct answer in one short sentence, then ask exactly this next "
                f"question, word for word if the language is unchanged: {q.ask}"
            )
        case "next_part":
            return (
                f"Praise them in one short sentence: part {n - 1} is done. Then say 'Part {n} of "
                f"{total}: {d.part.title}' and teach it now.\n{_spec(d.part, n, total)}\n{INVITE}"
            )
        case "answer_doubt":
            back = (
                f"Then ask the open question again: {q.ask}"
                if q
                else "Then ask whether they are ready for a quick question."
            )
            return (
                f"The learner asked: '{d.text}'. Answer it clearly and briefly, tying it to this part "
                f"({d.part.title}: {'; '.join(d.part.points)}). {back}"
            )
        case "reveal":
            assert q and d.then
            return (
                "The learner could not answer even after you taught it again. Kindly give the correct "
                f"answer ({q.answer}) to the question '{q.ask}', explain why in one or two sentences, "
                f"and say you will come back to it. Then continue: {_instruction(d.then)}"
            )
        case "finish":
            titles = "; ".join(p.title for p in d.plan.parts)
            gaps = "; ".join(d.revealed) or "none"
            return (
                f"Congratulate them. Say what they covered ({titles}). They answered {d.correct} "
                f"question(s) correctly. Things to revise: {gaps}. Offer to practise again or learn "
                "something else."
            )
        case _:  # redirect
            back = (
                f"Then ask the open question again: {q.ask}" if q else "Then continue the lesson."
            )
            return (
                f"The learner said something not about the lesson: '{d.text}'. Answer in one short, "
                f"friendly sentence, then bring them back. {back}"
            )


class EmptyReply(RuntimeError):
    """Claude returned no text."""


class ClaudeBrain:
    def __init__(self, client: anthropic.Anthropic):
        self.client = client

    def _json(
        self, model_cls: type[T], model: str, system: str, messages: list, max_tokens: int
    ) -> T:
        res = self.client.messages.create(
            model=model,
            max_tokens=max_tokens,
            thinking=NO_THINKING[model],  # nothing hidden to wait for in a spoken turn
            system=system,
            messages=messages,
            output_config={
                "format": {"type": "json_schema", "schema": anthropic.transform_schema(model_cls)}
            },
        )
        text = "".join(b.text for b in res.content if b.type == "text")
        return model_cls.model_validate_json(text)

    def plan(self, topic: str, document: Document | None, language: Lang, style: Style) -> Plan:
        system = (
            f"{PERSONA}\nYou are now preparing a lesson plan, not talking. Analyse the topic or the "
            "attached material completely before splitting it. Split it into 2 to 6 parts, easiest "
            "first, each part ONE concept a learner can master in a few minutes. If the material is a "
            "list of questions or exercises, teach the concept each one needs (group related ones), "
            "not just the answers. For each part give: a short title; 2 to 4 plain points to teach in "
            "order; one everyday example; the minutes it takes (1 to 8); and 2 quiz questions that "
            "test whether the concept was understood (not recall of wording), each with a short "
            "reference answer and a hint that nudges without giving the answer away. Each question "
            f"must have one clear short answer. Write everything in {LANGUAGES[language]}. "
            f"{STYLE[style]}"
        )
        content: list[dict] = []
        if document is not None:
            if document.media_type == "text/plain":
                text = base64.b64decode(document.data).decode("utf-8", "replace")[:60000]
                content.append({"type": "text", "text": f"Material ({document.name}):\n{text}"})
            else:
                kind = "document" if document.media_type == "application/pdf" else "image"
                source = {
                    "type": "base64",
                    "media_type": document.media_type,
                    "data": document.data,
                }
                content.append({"type": kind, "source": source})
        wanted = topic or "(whatever the material teaches)"
        content.append(
            {"type": "text", "text": f"Topic the learner wants: {wanted}. Make the plan."}
        )
        plan = self._json(Plan, PLAN_MODEL, system, [{"role": "user", "content": content}], 6000)
        plan.language = language
        for part in plan.parts:  # the schema cannot cap these, so trim rather than fail the lesson
            part.quiz = part.quiz[:3]
        return plan

    def chat(self, history: list[Message], language: Lang, style: Style) -> ChatResult:
        system = (
            f"{PERSONA}\n{_language(language)} {STYLE[style]}\nRight now you are just chatting, like a "
            "friendly person: answer naturally in 1 to 3 short sentences. If the learner asks to "
            "learn, study or be taught anything (a concept, a subject, a chapter, homework), or says "
            "they attached material, set study_topic to that topic in a few words and tell them in one "
            "sentence that you will prepare it; otherwise set study_topic to null. Always put your "
            "spoken words in reply."
        )
        return self._json(ChatResult, TALK_MODEL, system, _transcript(history), 500)

    def judge(
        self,
        history: list[Message],
        text: str,
        mode: str,
        part: Part,
        question: Question | None,
        language: Lang,
    ) -> Judgement:
        ctx = f"Lesson part being taught: {part.title}. Mode: {mode}."
        if question is not None:
            ctx += f"\nOpen question: {question.ask}\nReference answer: {question.answer}"
        system = (
            "You read what a learner just said to their teacher and classify it. Output JSON only.\n"
            f"{ctx}\n"
            "intent: 'again' = they do not understand, ask to hear it again, say wait / slow down / "
            "explain differently / simpler / in another language; 'doubt' = they ask a question about "
            "the content; 'ready' = they are ready or agree to continue; 'answer' = they attempt an "
            "answer to the open question (also 'I do not know', which is a wrong answer); 'skip' = "
            "they want to skip; 'stop' = they want to end the lesson; 'other' = unrelated chat.\n"
            "verdict (only when intent is 'answer'): 'correct' if it means the same as the reference "
            "answer (wording, spelling and language may differ; numbers must be exactly equal), "
            "'partly' if some right but incomplete, else 'wrong'. Judge ONLY against the open "
            "question and reference answer above, whatever else the teacher said earlier.\n"
            "language: set only if they ask to switch language (en, hi, ta, or). style: 'simple' if "
            "they ask for simpler or like a five-year-old, 'normal' if they ask to go back; else null."
        )
        msgs = [*_transcript(history[:-1], 4), {"role": "user", "content": f"Learner said: {text}"}]
        if msgs[0]["role"] != "user":
            msgs = msgs[1:]
        return self._json(Judgement, TALK_MODEL, system, msgs, 150)

    def say(
        self, directive: Directive, history: list[Message], language: Lang, style: Style
    ) -> str:
        system = f"{PERSONA}\n{_language(language)} {STYLE[style]}"
        last = history[-1].content if history and history[-1].role == "user" else ""
        said = f"The learner just said: {last}\n\n" if last else ""
        # The task rides on the final turn, so the model follows it, not just the learner's words.
        task = (
            f"{said}The lesson engine has already weighed what the learner said and decided what "
            "happens next. Your whole reply must do exactly this, in your own warm words:\n"
            f"{_instruction(directive)}"
        )
        before = history[:-1] if last else history
        msgs = [*_transcript(before, 6), {"role": "user", "content": task}]
        if msgs[0]["role"] != "user":
            msgs = msgs[1:]
        res = self.client.messages.create(
            model=TALK_MODEL,
            max_tokens=900,
            thinking=NO_THINKING[TALK_MODEL],
            system=system,
            messages=msgs,
        )
        reply = "".join(b.text for b in res.content if b.type == "text").strip()
        if not reply:
            raise EmptyReply("Claude returned no text")
        return reply
