"""Guardrail tiers 2 and 3: Haiku 5.5 reviews what the scriptwriter wrote.

Tier 3 (back-translation) runs first and blind: every line is glossed into English without the
lesson plan, so the gloss shows what the line actually says, not what it was meant to say.
Tier 2 (rubric) then scores the episode with that gloss beside each line.
Both are soft checks: a failing review earns the scriptwriter's repair turn but never blocks the
episode. Tier 4, a native-speaker reviewer in the Studio, decides.

CLI: python -m app.factory.judge <lesson.json> <district.json> [episode.json]
     (with an episode: review it; without: generate + review)
"""

import json
import logging
import sys
from pathlib import Path
from typing import Literal

import anthropic
from pydantic import BaseModel, Field

from app.config import settings
from app.factory.schema import Episode
from app.factory.scriptwriter import LANG_NAMES, District, Lesson, write_episode

JUDGE_MODEL = "claude-haiku-5-5"
PASS_SCORE = 4  # every criterion must score at least this, and no safety issue may be open
log = logging.getLogger(__name__)

Criterion = Literal["pedagogy", "age_fit", "accuracy", "language_bridge", "localisation", "safety"]


class GlossLine(BaseModel):
    line_id: str
    english: str


class Gloss(BaseModel):
    lines: list[GlossLine]


class Score(BaseModel):
    score: int = Field(ge=1, le=5)
    reason: str


class Scores(BaseModel):
    pedagogy: Score
    age_fit: Score
    accuracy: Score
    language_bridge: Score
    localisation: Score
    safety: Score


class Issue(BaseModel):
    line_id: str
    criterion: Criterion
    problem: str
    fix: str


class Rubric(BaseModel):
    scores: Scores
    issues: list[Issue]


class Review(BaseModel):
    """Stored with the episode and shown in the Studio next to each line."""

    model: str = JUDGE_MODEL
    rubric: Rubric
    gloss: list[GlossLine]

    @property
    def passed(self) -> bool:
        low = [c for c, s in self.rubric.scores if s.score < PASS_SCORE]
        return not low and not any(i.criterion == "safety" for i in self.rubric.issues)

    def problems(self) -> list[str]:
        """Phrased as instructions for the scriptwriter's repair turn; empty when passed."""
        if self.passed:
            return []
        out = [
            f"Reviewer scored {c} {s.score}/5: {s.reason}"
            for c, s in self.rubric.scores
            if s.score < PASS_SCORE
        ]
        issues = self.rubric.issues
        out += [f"{i.line_id} ({i.criterion}): {i.problem} Fix: {i.fix}" for i in issues]
        return out


class JudgeError(Exception):
    pass


GLOSS_SYSTEM = """You translate lines from children's audio lessons into plain, literal English.
Translate each line exactly as written, one by one. Do not correct, improve, summarise or explain.
Keep numbers as words if they are words ("thirteen", not "13"). If a line is ungrammatical, \
garbled or not in the stated language, translate what you can and add "[unclear]" or \
"[wrong language]". Return one entry per line_id."""

RUBRIC_SYSTEM = """You are a strict reviewer of Interactive Radio Instruction (IRI) audio episodes \
for multigrade government primary schools in India, aligned to NIPUN Bharat foundational literacy \
and numeracy. A speaker plays the episode to one grade while the only teacher teaches another \
grade, so children must be able to follow it alone, by ear.

You get the lesson goal, the district profile, the episode JSON, and an independent literal \
English gloss of every line. Use the gloss to understand lines in languages you read less well, \
and compare it with what the line was meant to do: a gloss that says something different from \
the intent is a meaning problem.

Score each criterion 1-5 (5 = ready for children, 4 = minor polish only, 3 = needs real changes, \
2 = major problems, 1 = unusable) with a one-sentence reason:
- pedagogy: teaches the learning outcome step by step; children respond or act every 30-60 s; \
pauses long enough; easier/core/stretch branches really are easier/same/harder; the checkpoint \
is answerable at a glance.
- age_fit: short sentences, familiar words and numbers within the grade's range.
- accuracy: every fact, number word and sum is correct, and number words match their digits in \
both languages.
- language_bridge: new ideas and every instruction to act start in the home language and are \
restated in the school language; the bridged pairs say the same thing in the gloss. More school \
language in later practice and chants is intended, not a fault.
- localisation: uses the district's names, food, animals, festivals and free props naturally, \
with no stereotypes.
- safety: nothing harmful, shaming, frightening, religiously partisan or unsafe to do (e.g. \
putting seeds in mouths); no brand names.

List every concrete issue you find with the line_id, the criterion, the problem and a specific \
fix. Do not list praise. If something is fine, leave it out."""


def _ask[T: BaseModel](client: anthropic.Anthropic, system: str, prompt: str, fmt: type[T]) -> T:
    with client.messages.stream(
        model=JUDGE_MODEL,
        max_tokens=32000,
        system=system,
        messages=[{"role": "user", "content": prompt}],
        output_format=fmt,
    ) as stream:
        message = stream.get_final_message()
    log.info("%s %s usage=%s", message.model, message.stop_reason, message.usage)
    if message.stop_reason in ("refusal", "max_tokens"):
        raise JudgeError(f"review stopped: {message.stop_reason}")
    return message.parsed_output


def review(
    episode: Episode, lesson: Lesson, district: District, client: anthropic.Anthropic | None = None
) -> Review:
    client = client or anthropic.Anthropic(api_key=settings.anthropic_api_key or None)
    lines = [{"line_id": x.id, "lang": LANG_NAMES[x.lang], "text": x.text} for x in episode.lines()]
    gloss = _ask(client, GLOSS_SYSTEM, json.dumps(lines, ensure_ascii=False), Gloss).lines
    prompt = f"""Lesson goal (NIPUN Bharat): {lesson.nipun_lo}
Grade {lesson.grade}. Chapter: {lesson.chapter}. {lesson.notes}

District profile:
{district.model_dump_json(indent=2)}

Episode:
{episode.model_dump_json(indent=2, exclude={"chalk_sketch_svg"})}

Independent literal English gloss (line_id: English):
{chr(10).join(f"{g.line_id}: {g.english}" for g in gloss)}"""
    rubric = _ask(client, RUBRIC_SYSTEM, prompt, Rubric)
    return Review(rubric=rubric, gloss=gloss)


def generate(
    lesson: Lesson,
    district: District,
    phrase_bank: list[str] | None = None,
    client: anthropic.Anthropic | None = None,
) -> tuple[Episode, Review]:
    """Scriptwriter + tier 1 rules + tiers 2-3 review, with one shared repair turn."""
    client = client or anthropic.Anthropic(api_key=settings.anthropic_api_key or None)
    reviews: list[Review] = []

    def feedback(episode: Episode) -> list[str]:
        reviews.append(review(episode, lesson, district, client))
        return reviews[-1].problems()

    episode = write_episode(lesson, district, phrase_bank, client, feedback=feedback)
    return episode, reviews[-1]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    lesson = Lesson.model_validate_json(Path(sys.argv[1]).read_text())
    district = District.model_validate_json(Path(sys.argv[2]).read_text())
    if len(sys.argv) > 3:
        episode = Episode.model_validate_json(Path(sys.argv[3]).read_text())
        result = review(episode, lesson, district)
    else:
        episode, result = generate(lesson, district)
    out = {"passed": result.passed, "episode": episode.model_dump(), "review": result.model_dump()}
    print(json.dumps(out, ensure_ascii=False, indent=2))
