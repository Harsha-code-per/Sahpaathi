"""The perception agents. Each one looks at one kind of evidence and scores five signals from 0 to 1.

They are small, fast and deterministic on purpose: they run every few seconds, and their scores are
easy to test and to explain ("the brow stayed down for most of the last 10 seconds"). The orchestrator
(graph.py) combines them. Starting weights are priors, not facts: `weights.json`, trained on the
learners' own labelled sessions (see ml/), replaces them when present.
"""

from collections.abc import Callable, Iterable

from app.tutor.sense.schema import AgentReport, Context, Sample

Agent = Callable[[list[Sample], Context], AgentReport]


def clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def mean(values: Iterable[float]) -> float:
    vals = list(values)
    return sum(vals) / len(vals) if vals else 0.0


def face_agent(samples: list[Sample], ctx: Context) -> AgentReport:
    """Facial expression: a lowered brow, squint or pressed lips (puzzled), heavy eyes or a yawn (tired),
    eyes or head off the screen (distracted)."""
    faces = [s.face for s in samples if s.face is not None]
    presence = len(faces) / len(samples)
    if not faces:
        return AgentReport(agent="face", weight=0.0, notes=["no face in view"])
    m = {k: mean(getattr(f, k) for f in faces) for k in type(faces[0]).model_fields}
    scores = {
        "confused": clamp(
            1.8 * m["brow_down"]
            + 0.8 * m["brow_inner_up"]
            + 1.0 * m["eye_squint"]
            + 0.8 * m["mouth_press"]
            + 0.6 * m["mouth_frown"]
        ),
        "tired": clamp(1.6 * m["eye_closure"] + 1.4 * m["jaw_open"] + 0.6 * m["head_down"]),
        "distracted": clamp(1.5 * m["gaze_away"] + 1.2 * (1 - presence)),
        "uncomfortable": clamp(
            1.2 * m["mouth_frown"] + 0.9 * m["mouth_press"] + 0.6 * m["brow_inner_up"]
        ),
    }
    notes = []
    if scores["confused"] > 0.5:
        notes.append("brow stayed lowered or squinting")
    if scores["tired"] > 0.5:
        notes.append("eyes heavy or yawning")
    if scores["distracted"] > 0.5:
        notes.append("looking away from the screen")
    return AgentReport(agent="face", scores=scores, weight=presence, notes=notes)


def posture_agent(samples: list[Sample], ctx: Context) -> AgentReport:
    """Body language: slumping (tired), leaning away (disengaged), a hand to the face (thinking or unease)."""
    poses = [s.pose for s in samples if s.pose is not None]
    if not poses:
        return AgentReport(agent="posture", weight=0.0, notes=["body not in view"])
    m = {k: mean(getattr(p, k) for p in poses) for k in type(poses[0]).model_fields}
    scores = {
        "tired": clamp(1.4 * m["slouch"]),
        "distracted": clamp(1.1 * m["lean_back"]),
        "uncomfortable": clamp(0.9 * m["hand_to_face"] + 0.6 * m["lean_back"]),
        "confused": clamp(0.7 * m["hand_to_face"]),
    }
    notes = []
    if scores["tired"] > 0.5:
        notes.append("slumped posture")
    if scores["distracted"] > 0.5:
        notes.append("leaning away")
    if m["hand_to_face"] > 0.5:
        notes.append("hand at the face")
    return AgentReport(
        agent="posture", scores=scores, weight=len(poses) / len(samples) * 0.8, notes=notes
    )


def audio_agent(samples: list[Sample], ctx: Context) -> AgentReport:
    """The surroundings: background sound above the learner's usual floor while they are not speaking.
    While the teacher's voice plays, the microphone hears it too, so this agent trusts itself less then."""
    audio = [s.audio for s in samples if s.audio is not None and not s.audio.speaking]
    if not audio:
        return AgentReport(agent="audio", weight=0.0, notes=["no quiet moments to listen to"])
    noise = mean(a.noise for a in audio)
    spikes = sum(1 for a in audio if a.noise > 0.6) / len(audio)
    noisy = clamp(2.2 * noise + 0.6 * spikes)
    notes = ["background noise above the usual level"] if noisy > 0.5 else []
    return AgentReport(
        agent="audio",
        scores={"noisy": noisy, "distracted": clamp(0.5 * noisy)},
        weight=0.4 if ctx.teacher_speaking else 1.0,
        notes=notes,
    )


def response_agent(samples: list[Sample], ctx: Context) -> AgentReport:
    """How they answer: a long pause before replying, fillers, repeated misses, or a long silence."""
    latency = ctx.latency_s or 0.0
    scores = {
        "confused": clamp(0.3 * ctx.misses + latency / 20 + 0.1 * ctx.fillers),
        "tired": clamp(ctx.silence_s / 60),
        "distracted": clamp(ctx.silence_s / 45) if latency > 8 or ctx.silence_s > 20 else 0.0,
    }
    notes = []
    if ctx.misses:
        notes.append("missed the last question")
    if latency > 8:
        notes.append("took a long time to answer")
    if ctx.silence_s > 20:
        notes.append("quiet for a while")
    has_evidence = ctx.misses or latency or ctx.fillers or ctx.silence_s
    # An open question makes the evidence meaningful; during teaching it is weak.
    weight = 0.0 if not has_evidence else (0.8 if ctx.mode == "quiz" else 0.4)
    return AgentReport(agent="response", scores=scores, weight=weight, notes=notes)


AGENTS: dict[str, Agent] = {
    "face": face_agent,
    "posture": posture_agent,
    "audio": audio_agent,
    "response": response_agent,
}
