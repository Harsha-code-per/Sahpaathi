"""Break activities the code makes and checks itself, so a score is never the model's opinion.

Riddles are the only activity Claude writes (brain.riddle); sums and patterns are generated here, in
English with digits, and answers are matched as numbers.
"""

import random
import re

from app.tutor.models import Activity, Question, Style

ROUNDS = 3


def maths(rng: random.Random, style: Style) -> list[Question]:
    """Three quick sums. 'simple' keeps every number to 10 or under."""
    top = 10 if style == "simple" else 20
    out = []
    for _ in range(ROUNDS):
        a, b = rng.randint(2, top - 2), rng.randint(1, top // 2)
        if rng.random() < 0.5:
            out.append(
                Question(
                    ask=f"What is {a} plus {b}?",
                    answer=str(a + b),
                    hint=f"Start at {a} and count up {b} more.",
                )
            )
        else:
            big, small = max(a, b + 1), min(b, max(a, b + 1) - 1)
            out.append(
                Question(
                    ask=f"What is {big} minus {small}?",
                    answer=str(big - small),
                    hint=f"Start at {big} and count back {small}.",
                )
            )
    return out


def pattern(rng: random.Random, style: Style) -> list[Question]:
    """Three number patterns that go up (or down) by the same step each time."""
    out = []
    for step in rng.sample([1, 2, 3, 5, 10] if style == "normal" else [1, 2, 5], ROUNDS):
        up = rng.random() < 0.8
        start = rng.randint(1, 10) if up else rng.randint(20, 30)
        shown = [start + (step if up else -step) * i for i in range(4)]
        nxt = start + (step if up else -step) * 4
        word = "up" if up else "down"
        out.append(
            Question(
                ask=f"{', '.join(map(str, shown))}, and then? What number comes next?",
                answer=str(nxt),
                hint=f"Look at how much it goes {word} each time: it is {step}.",
            )
        )
    return out


def make(kind: Activity, rng: random.Random, style: Style) -> list[Question]:
    if kind == "maths":
        return maths(rng, style)
    if kind == "pattern":
        return pattern(rng, style)
    return []


def numeric_verdict(said: str, answer: str) -> bool | None:
    """True or False when the student's words contain a number to compare; None when they do not
    (e.g. 'twelve'), so the model can judge instead."""
    if not answer.lstrip("-").isdigit():
        return None
    found = re.findall(r"-?\d+", said)
    return None if not found else answer in {str(int(n)) for n in found}
