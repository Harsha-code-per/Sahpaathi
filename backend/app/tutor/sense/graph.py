"""The perception graph (LangGraph): four agents look at the same window in parallel, then one
orchestrator weighs what they found and decides whether the teacher should ask "is everything okay?".

    START -> face ----\\
          -> posture ---+-> orchestrator -> END
          -> audio -----/
          -> response -/

The orchestrator combines agents with a noisy-OR (one strong witness is enough, agreement makes it
stronger), then requires enough data and a high enough score before it suggests a check-in. It only
ever suggests a question. What the learner answers is what the teacher acts on.
"""

import json
import math
import operator
from pathlib import Path
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph

from app.tutor.sense.agents import AGENTS
from app.tutor.sense.schema import SIGNALS, AgentReport, Context, Insight, Sample, SenseIn, State

# How much the orchestrator trusts each agent, before the agent's own data-quality weight.
IMPORTANCE = {"face": 1.0, "posture": 0.7, "audio": 1.0, "response": 0.9}
CHECK_IN_AT = 0.6  # the strongest signal must reach this to suggest a check-in
MIN_SAMPLES = 6  # about six seconds of evidence, so one grimace never triggers anything
WEIGHTS_FILE = Path(__file__).with_name("weights.json")

# The window summary that the learner's own log and the training script use (ml/train_sense.py).
FEATURES = (
    "brow_down brow_inner_up eye_squint mouth_frown mouth_press eye_closure jaw_open gaze_away "
    "head_down slouch hand_to_face lean_back noise face_missing misses latency_s fillers silence_s"
).split()


class SenseState(TypedDict):
    samples: list[Sample]
    context: Context
    reports: Annotated[list[AgentReport], operator.add]  # each parallel agent appends its own
    features: dict[str, float]
    insight: Insight | None


def summarise(samples: list[Sample], ctx: Context) -> dict[str, float]:
    """The window as one row of numbers: means of every measurement, plus the lesson context."""

    def avg(get) -> float:
        vals = [get(s) for s in samples if get(s) is not None]
        return sum(vals) / len(vals) if vals else 0.0

    row = {
        name: avg(lambda s, n=name: getattr(s.face, n) if s.face else None)
        for name in (
            "brow_down",
            "brow_inner_up",
            "eye_squint",
            "mouth_frown",
            "mouth_press",
            "eye_closure",
            "jaw_open",
            "gaze_away",
            "head_down",
        )
    }
    row |= {
        name: avg(lambda s, n=name: getattr(s.pose, n) if s.pose else None)
        for name in ("slouch", "hand_to_face", "lean_back")
    }
    row["noise"] = avg(lambda s: s.audio.noise if s.audio and not s.audio.speaking else None)
    row["face_missing"] = sum(1 for s in samples if s.face is None) / len(samples)
    row |= {
        "misses": ctx.misses,
        "latency_s": ctx.latency_s or 0.0,
        "fillers": ctx.fillers,
        "silence_s": ctx.silence_s,
    }
    return {k: round(float(row[k]), 4) for k in FEATURES}


def load_weights(path: Path = WEIGHTS_FILE) -> dict | None:
    """Trained weights, if a `weights.json` from ml/train_sense.py sits next to this file."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return None


def _learned(model: dict, features: dict[str, float]) -> float:
    z = model.get("bias", 0.0) + sum(
        c * features.get(f, 0.0) for f, c in model.get("coef", {}).items()
    )
    return 1 / (1 + math.exp(-max(-30.0, min(30.0, z))))


def orchestrate(state: SenseState) -> dict:
    reports, ctx, samples = state["reports"], state["context"], state["samples"]
    features = summarise(samples, ctx)
    scores = {}
    for sig in SIGNALS:
        miss = 1.0  # noisy-OR: the chance that no agent is sounding the alarm
        for r in reports:
            w = IMPORTANCE.get(r.agent, 0.5) * r.weight
            miss *= 1 - w * r.scores.get(sig, 0.0)
        scores[sig] = round(1 - miss, 3)
    weights = load_weights()
    at = dict.fromkeys(SIGNALS, CHECK_IN_AT)  # how high each score must be to suggest a check-in
    if weights:  # a model trained on real labelled sessions replaces the hand-set rules it covers
        for sig, model in weights.get("models", {}).items():
            if sig in scores:
                scores[sig] = round(_learned(model, features), 3)
                # the threshold was chosen on held-out data for a target precision; keep it sane
                at[sig] = min(0.9, max(0.4, float(weights.get("threshold", CHECK_IN_AT))))
    firing = [s for s in SIGNALS if scores[s] >= at[s]]
    top: State = max(firing or SIGNALS, key=lambda s: scores[s])
    notable = bool(firing)
    state_name: State = top if notable else "focused"
    reasons = (
        [n for r in reports if r.scores.get(top, 0) > 0.3 for n in r.notes][:4] if notable else []
    )
    enough = len(samples) >= MIN_SAMPLES
    insight = Insight(
        state=state_name,
        confidence=round(scores[top] if notable else 1 - scores[top], 3),
        scores=scores,
        reasons=reasons,
        check_in=notable and enough,
        features=features,
    )
    return {"insight": insight, "features": features}


def _node(name: str):
    def run(state: SenseState) -> dict:
        return {"reports": [AGENTS[name](state["samples"], state["context"])]}

    return run


def build():
    graph = StateGraph(SenseState)
    for name in AGENTS:
        graph.add_node(name, _node(name))
        graph.add_edge(START, name)  # all four start together
        graph.add_edge(name, "orchestrator")  # and the orchestrator waits for all of them
    graph.add_node("orchestrator", orchestrate)
    graph.add_edge("orchestrator", END)
    return graph.compile()


GRAPH = build()


def analyse(body: SenseIn) -> Insight:
    out = GRAPH.invoke(
        {
            "samples": body.samples,
            "context": body.context,
            "reports": [],
            "features": {},
            "insight": None,
        }
    )
    return out["insight"]
