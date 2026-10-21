"""Claude scriptwriter: lesson + district profile -> schema-valid IRI episode.

Run once per language x grade in the cloud, never in the classroom.
CLI: python -m app.factory.scriptwriter <lesson.json> <district.json> [phrase_bank.json]
"""

import json
import logging
import sys
from collections.abc import Callable
from pathlib import Path

import anthropic
from pydantic import BaseModel, ValidationError

from app.config import settings
from app.factory import rules
from app.factory.schema import Episode, Lang, Segment

MODEL = "claude-sonnet-5-5"
log = logging.getLogger(__name__)
LANG_NAMES = {
    "ta": "Tamil",
    "hi": "Hindi",
    "or": "Odia",
    "sat": "Santali (Ol Chiki script)",
    "en": "English",
}


class Lesson(BaseModel):
    """content/curriculum/*.json"""

    id: str
    grade: int
    subject: str
    nipun_lo: str  # NIPUN Bharat learning outcome this episode targets
    chapter: str  # textbook chapter title and source
    notes: str  # what the chapter teaches, in our own words or a licensed extract
    duration_min: int = 15


class District(BaseModel):
    """content/districts/*.json"""

    id: str
    name: str
    state: str
    home_lang: Lang
    school_lang: Lang
    names: list[str]
    crops: list[str]
    festivals: list[str]
    fauna: list[str]
    props: list[str]
    notes: str = ""


class ScriptwriterError(Exception):
    pass


SYSTEM = """You write Interactive Radio Instruction (IRI) episodes for Sahpaathi, an offline audio \
co-teacher for multigrade government primary schools in India. A Bluetooth speaker plays your \
episode to one grade while the only teacher in the room teaches another grade. The children have \
no devices, often no textbook, and many speak a home language different from the school language.

How IRI works (follow it closely):
- Audio only. The children cannot see anything, so describe everything they need to do.
- The guide voice speaks straight to the children: warm, playful, short sentences (at most 12 \
words), lots of repetition and praise for effort.
- Children are active every 30-60 seconds: call-and-response ("Say it with me"), counting chants \
and songs, short stories, actions with free physical props, slate writing, pair work.
- Every time children must answer or act, set pause_after_sec to the time they need (3-8 s to say \
an answer, 10-30 s for a task) and put a short `cue` describing what the children should be doing.
- Ask, wait, then confirm. Never state an answer the children are about to work out (a count, a \
comparison, a sum) before the pause in which they answer it; give it right after the pause. A \
"child" line may model how to answer only before the children's own first try of a new kind of task.
- The teacher is busy with the other grade. Children manage every activity on their own; never \
ask the teacher for help during a segment.

Language bridge (NEP 2020 mother tongue first):
- Introduce each new idea in the home language, then say the key words again in the school \
language. Always give number words in both languages.
- Every instruction that tells children what to do (pick up, count, say, show, find a partner) \
is said first in the home language, then repeated in the school language, as two lines. Children \
must never have to act on words they do not understand yet. Practice, chants and praise are where \
the school language takes over.
- Hand over to the school language segment by segment. Counting the lines in each segment's \
`teach` + `core`: segment 1 is about 70% home-language lines, each later segment has more \
school-language lines than the one before, and the last segment reaches the school-language share \
given in the brief. Code checks these numbers.
- Write each line in exactly one language and set `lang` to it. Use the native script.
- Teacher-facing text (episode title, materials, every `cue`, every `checkpoint`) is in the school \
language, because that is what the teacher reads.

Make it local: use the district's children's names (balance girls and boys), crops, animals, \
festivals and the free props listed. Never use brand names, stereotypes, religious preference, \
shaming or punishment. Activities must be safe for 5-9 year olds (e.g. remind them not to put \
seeds or pebbles in their mouths).

Structure:
- Segments: 3-5 segments that together teach the learning outcome. `teach` is always played.
- `checkpoint`: one yes/no question the teacher can answer by glancing at the children for a \
second (e.g. "Are most children holding up 7 pebbles?"). It checks exactly what that segment's \
`teach` part just practised, with the same numbers, never something taught later.
- `materials`: enough for the largest amount any activity asks for (if one task needs 20 pebbles \
per child, say 20, not 15). The `ivr_recap` asks only for what a home has and never asks the child \
to count past the number of things it told them to fetch.
- After the teacher's tap: `easier` (few got it) re-teaches with smaller numbers, more concrete \
props and slower pace; `core` (some got it) gives more practice at the same level; `stretch` \
(most got it) extends one small step further. Each 1-3 minutes.
- Spoken time of all `teach` + `core` lines plus their pauses should be close to duration_min.
- `analogy`: a 60-second very simple story from village life that explains the core idea, \
mostly in the home language. It plays when the teacher presses "need a simpler analogy".
- `ivr_recap`: a 3-5 minute recap a child hears alone on a parent's basic phone the evening they \
missed class. It must work with no props except fingers or small stones from home. Do not mention \
keypad presses; the call system adds those.
- `math_checks`: one entry for every arithmetic fact the episode states or asks, using integers \
and + - * / only, e.g. {"expr": "7 - 3", "answer": 4}. These are verified by code, so they must be \
exactly what the episode says.
- `chalk_sketch_svg`: a simple line drawing the teacher copies onto the blackboard in 2 minutes \
before class (black strokes, a viewBox, at most 20 shapes, digits only, no words).
- Line ids are lowercase kebab-case and unique across the whole episode, e.g. s1-t1, s1-e2, a1, r3.
- speaker: "guide" for the co-teacher voice, "child" for a recorded child modelling an answer, \
"song" for chants and songs.

Accuracy matters more than creativity: never state a wrong fact, and keep every number within \
the learning outcome's range."""


def _brief(lesson: Lesson, district: District, phrase_bank: list[str] | None) -> str:
    brief = f"""Write one episode.

Learning outcome (NIPUN Bharat): {lesson.nipun_lo}
Grade: {lesson.grade} | Subject: {lesson.subject} | Target duration: {lesson.duration_min} minutes
Last segment: at least {rules.last_segment_min_school(lesson.grade):.0%} school-language lines
Chapter: {lesson.chapter}
What the chapter teaches:
{lesson.notes}

District: {district.name}, {district.state}
Home language: {LANG_NAMES[district.home_lang]} (code "{district.home_lang}")
School language: {LANG_NAMES[district.school_lang]} (code "{district.school_lang}")
Children's names: {", ".join(district.names)}
Crops and food: {", ".join(district.crops)}
Festivals: {", ".join(district.festivals)}
Animals: {", ".join(district.fauna)}
Free props in every classroom: {", ".join(district.props)}"""
    if district.notes:
        brief += f"\nContext: {district.notes}"
    if district.home_lang == district.school_lang:
        brief += "\nHome and school language are the same: write the whole episode in it."
    if phrase_bank:
        # No TTS exists for this language: every home-language line is spliced from a recording,
        # so it must match a recorded phrase exactly.
        brief += (
            f"\n\n{LANG_NAMES[district.home_lang]} has no synthetic voice. Every line with "
            f'lang "{district.home_lang}" must be exactly one of these recorded phrases, '
            "copied character for character:\n" + "\n".join(f"- {p}" for p in phrase_bank)
        )
    return brief


def write_episode(
    lesson: Lesson,
    district: District,
    phrase_bank: list[str] | None = None,
    client: anthropic.Anthropic | None = None,
    feedback: Callable[[Episode], list[str]] | None = None,
) -> Episode:
    """One generation, plus one repair turn if it breaks the contract or a tier-1 rule.

    `feedback` is a soft check (the LLM judge): its problems earn the repair turn, but after the
    repair the episode is returned anyway, because a human reviewer decides next.
    """
    client = client or anthropic.Anthropic(api_key=settings.anthropic_api_key or None)
    messages: list = [{"role": "user", "content": _brief(lesson, district, phrase_bank)}]
    episode_id = f"g{lesson.grade}-{lesson.id}-{district.id}"
    valid: Episode | None = None  # the last attempt that passed the contract and tier-1 rules
    error = ""
    for attempt in range(2):
        with client.beta.messages.stream(
            model=MODEL,
            # A first attempt uses 45-58k tokens (mostly thinking); 64k cut off 2 of 8 in a batch.
            max_tokens=128000,
            system=SYSTEM,
            messages=messages,
            output_config={
                "format": {"type": "json_schema", "schema": anthropic.transform_schema(Episode)}
            },
            cache_control={"type": "ephemeral"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            message = stream.get_final_message()
        log.info("%s %s usage=%s", message.model, message.stop_reason, message.usage)
        if message.stop_reason in ("refusal", "max_tokens"):
            error = f"generation stopped: {message.stop_reason}"
            if valid is not None:  # a failed repair: the valid first attempt is kept below
                break
            raise ScriptwriterError(error)
        text = next(b.text for b in message.content if b.type == "text")
        try:
            episode = Episode.model_validate_json(text)
            error = "\n".join(rules.check(episode))
        except ValidationError as e:
            error = str(e)
        if not error:
            valid = episode
            if feedback:
                soft = feedback(episode)  # always run, so the caller has the final episode's review
                error = "\n".join(soft) if attempt == 0 else ""
        if not error:
            return episode.model_copy(update={"id": episode_id})
        log.info("repair needed: %s", error)
        messages += [
            {"role": "assistant", "content": message.content},
            {
                "role": "user",
                "content": f"The episode failed these checks. Return the complete corrected "
                f"episode.\n{error}",
            },
        ]
    if valid is not None:  # the repair broke a hard rule: the first attempt is still usable
        log.info("repair broke the contract or a rule, keeping the first attempt: %s", error)
        return valid.model_copy(update={"id": episode_id})
    raise ScriptwriterError(f"episode still invalid after repair: {error}")


def rewrite_segment(
    lesson: Lesson,
    district: District,
    episode: Episode,
    segment_id: str,
    evidence: str,
    phrase_bank: list[str] | None = None,
    client: anthropic.Anthropic | None = None,
) -> Episode:
    """After classroom use: rewrites one segment from what classes showed (tap rates) and what the
    reviewer asks, keeping the rest of the episode. One repair turn, like write_episode."""
    client = client or anthropic.Anthropic(api_key=settings.anthropic_api_key or None)
    index = next(i for i, seg in enumerate(episode.segments) if seg.id == segment_id)
    old = episode.segments[index]
    prefix = old.teach[0].id.rsplit("-", 1)[0]  # the line-id prefix this part uses, e.g. "s2"
    brief = f"""{_brief(lesson, district, phrase_bank)}

This episode has been used in classrooms. Rewrite only segment "{segment_id}" ("{old.title}") and \
return that one segment.

What classrooms showed, and what the reviewer asks:
{evidence}

Keep its id "{segment_id}". Give every line a new id starting with "{prefix}-", unique in \
the episode. Fit it to the segments around it: the same children's names, props and language \
handover. Keep its numbers within the learning outcome.

The whole episode as it is now:
{episode.model_dump_json(exclude={"chalk_sketch_svg"})}"""
    messages: list = [{"role": "user", "content": brief}]
    error = ""
    for _attempt in range(2):
        with client.beta.messages.stream(
            model=MODEL,
            max_tokens=64000,  # one segment: a fraction of a whole episode
            system=SYSTEM,
            messages=messages,
            output_config={
                "format": {"type": "json_schema", "schema": anthropic.transform_schema(Segment)}
            },
            cache_control={"type": "ephemeral"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            message = stream.get_final_message()
        log.info("%s %s usage=%s", message.model, message.stop_reason, message.usage)
        if message.stop_reason in ("refusal", "max_tokens"):
            raise ScriptwriterError(f"rewrite stopped: {message.stop_reason}")
        text = next(b.text for b in message.content if b.type == "text")
        try:
            segment = Segment.model_validate_json(text).model_copy(update={"id": segment_id})
            segments = [*episode.segments[:index], segment, *episode.segments[index + 1 :]]
            new = Episode.model_validate({**episode.model_dump(), "segments": segments})
            error = "\n".join(rules.check(new))
        except ValidationError as e:
            error = str(e)
        if not error:
            return new
        log.info("rewrite repair needed: %s", error)
        messages += [
            {"role": "assistant", "content": message.content},
            {
                "role": "user",
                "content": f"The episode failed these checks with your segment. Return the "
                f"complete corrected segment.\n{error}",
            },
        ]
    raise ScriptwriterError(f"segment still invalid after repair: {error}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    lesson = Lesson.model_validate_json(Path(sys.argv[1]).read_text())
    district = District.model_validate_json(Path(sys.argv[2]).read_text())
    bank = json.loads(Path(sys.argv[3]).read_text()) if len(sys.argv) > 3 else None
    print(write_episode(lesson, district, bank).model_dump_json(indent=2))
