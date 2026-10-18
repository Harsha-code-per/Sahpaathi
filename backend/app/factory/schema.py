"""Episode contract: what the factory writes, the voice layer speaks and the player plays.

Mirrored by hand in app/src/lib/types.ts and documented in docs/EPISODE_SCHEMA.md.
Change all three in one PR.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SLUG = r"^[a-z0-9][a-z0-9-]*$"

# Language codes used across the system (ISO 639): Tamil, Hindi, Odia, Santali, English.
Lang = Literal["ta", "hi", "or", "sat", "en"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")  # LLM output with unknown keys is rejected


class Line(Strict):
    id: str = Field(pattern=SLUG)  # unique within the episode; names the audio file
    speaker: Literal["guide", "child", "song"]  # guide = the co-teacher voice
    lang: Lang
    text: str = Field(min_length=1)
    pause_after_sec: float = Field(default=0, ge=0, le=60)  # silence for children to answer or act
    cue: str | None = None  # shown to the teacher, never spoken: "children hold up 3 pebbles"


class MathCheck(Strict):
    """Every numeric task the episode asks carries its answer, verified deterministically."""

    expr: str  # e.g. "3 + 4"
    answer: int


class Segment(Strict):
    id: str = Field(pattern=SLUG)
    title: str
    activity: Literal["call_response", "song", "story", "slate", "pair_work", "pebble_task"]
    teach: list[Line] = Field(min_length=1)  # always played
    checkpoint: str  # question for the teacher: "Could most children show 7 pebbles?"
    # Follow-up after the teacher's tap: Few -> easier, Some -> core, Most -> stretch.
    # No tap within 10 s plays core.
    easier: list[Line] = Field(min_length=1)
    core: list[Line] = Field(min_length=1)
    stretch: list[Line] = Field(min_length=1)
    math_checks: list[MathCheck] = []


class Episode(Strict):
    schema_version: Literal[1] = 1
    id: str = Field(pattern=SLUG)
    title: str
    grade: int = Field(ge=1, le=5)
    subject: Literal["numeracy", "literacy"]
    nipun_lo: str  # NIPUN Bharat learning-outcome code, e.g. "N2.3"
    home_lang: Lang
    school_lang: Lang
    district: str
    duration_min: int = Field(ge=5, le=20)
    materials: list[str]  # free, local props: pebbles, tamarind seeds, slates
    chalk_sketch_svg: str  # drawn on the blackboard before class
    segments: list[Segment] = Field(min_length=1)
    analogy: list[Line] = Field(min_length=1)  # ~60 s "need a simpler analogy" story
    ivr_recap: list[Line] = Field(min_length=1)  # ~5 min catch-up for absent children

    @field_validator("chalk_sketch_svg")
    @classmethod
    def _is_svg(cls, v: str) -> str:
        if not v.lstrip().startswith("<svg") or len(v) > 50_000:
            raise ValueError("must be an <svg> document under 50 KB")
        return v

    @model_validator(mode="after")
    def _unique_line_ids(self) -> "Episode":
        ids = [line.id for line in self.lines()]
        dupes = {i for i in ids if ids.count(i) > 1}
        if dupes:
            raise ValueError(f"duplicate line ids: {sorted(dupes)}")
        return self

    def lines(self) -> list[Line]:
        out = [*self.analogy, *self.ivr_recap]
        for s in self.segments:
            out += [*s.teach, *s.easier, *s.core, *s.stretch]
        return out
