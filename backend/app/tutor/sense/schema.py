"""What the browser sends and what the perception agents answer with.

Privacy by design: the camera and microphone are processed **on the learner's device**. Only the
small numbers below ever reach the server: no image, no audio, no transcript of the surroundings. The
numbers are already relative to the learner's own calm baseline (measured in the first seconds), so
"0" means "as usual for this person".
"""

from typing import Literal

from pydantic import BaseModel, Field

# What the orchestrator can conclude. "focused" means nothing stands out.
Signal = Literal["confused", "distracted", "noisy", "tired", "uncomfortable"]
State = Literal["focused", "confused", "distracted", "noisy", "tired", "uncomfortable"]
SIGNALS: tuple[Signal, ...] = ("confused", "distracted", "noisy", "tired", "uncomfortable")


def u() -> float:
    return Field(default=0.0, ge=0.0, le=1.0)


class Face(BaseModel):
    """From the face landmarker's blendshapes, minus the learner's baseline."""

    brow_down: float = u()  # brows pulled down and together: concentration or puzzlement
    brow_inner_up: float = u()  # inner brows raised: worry
    eye_squint: float = u()
    mouth_frown: float = u()
    mouth_press: float = u()
    eye_closure: float = u()  # blinks and heavy eyelids
    jaw_open: float = u()  # a yawn
    gaze_away: float = u()  # eyes or head turned off the screen
    head_down: float = u()


class Pose(BaseModel):
    """From the pose landmarker, minus the baseline."""

    slouch: float = u()
    hand_to_face: float = u()
    lean_back: float = u()  # farther from the screen than at the start


class Audio(BaseModel):
    level: float = u()  # loudness of what the microphone hears
    noise: float = (
        u()
    )  # background sound above the learner's usual floor, when they are not speaking
    speaking: bool = False


class Sample(BaseModel):
    """One second of perception. Any part is None when it could not be measured (no face, no camera)."""

    t: float = Field(ge=0, le=100000)
    face: Face | None = None
    pose: Pose | None = None
    audio: Audio | None = None


class Context(BaseModel):
    """What the lesson knows, which the agents weigh against what they see."""

    mode: Literal["chat", "teach", "quiz", "break", "game", "done"] = "teach"
    misses: int = Field(default=0, ge=0, le=3)  # wrong answers on the open question
    latency_s: float | None = Field(
        default=None, ge=0, le=600
    )  # time to start answering the last question
    fillers: int = Field(default=0, ge=0, le=50)  # "umm", "hmm" in their last answer
    silence_s: float = Field(default=0, ge=0, le=600)  # quiet since the teacher stopped
    teacher_speaking: bool = False  # the speaker is playing: the microphone hears the teacher too


class SenseIn(BaseModel):
    samples: list[Sample] = Field(min_length=1, max_length=30)
    context: Context = Field(default_factory=Context)


class AgentReport(BaseModel):
    """One agent's reading: a 0 to 1 score per signal, and how much data it had to go on."""

    agent: str
    scores: dict[str, float] = Field(default_factory=dict)
    weight: float = Field(default=1.0, ge=0.0, le=1.0)  # 0 when it had nothing to look at
    notes: list[str] = Field(default_factory=list, max_length=4)


class Insight(BaseModel):
    """The orchestrator's conclusion. A hint for a gentle check-in, never a judgement."""

    state: State
    confidence: float = Field(ge=0.0, le=1.0)
    scores: dict[str, float]
    reasons: list[str] = Field(default_factory=list, max_length=4)
    check_in: bool  # worth asking "is everything okay?" now
    features: dict[str, float] = Field(
        default_factory=dict
    )  # window summary, for the learner's own log
