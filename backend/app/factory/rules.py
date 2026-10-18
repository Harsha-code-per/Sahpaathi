"""Guardrail tier 1: deterministic checks the LLM can't be trusted to self-enforce.

Each check returns human-readable problems; the scriptwriter sends them back to the model
for one repair turn, so phrase them as instructions.
"""

import ast
import operator

from app.factory.schema import Episode

# Mother tongue first, then hand over: share of lines in each segment's teach + core.
# Lines, not characters: Tamil words run ~3x longer than Hindi ones, so characters skew the share.
FIRST_SEGMENT_MIN_HOME = 0.5
# Grades 1-2 are still new to the school language, so the handover ends at half; Grade 3+ goes on.
LAST_SEGMENT_MIN_SCHOOL = {1: 0.5, 2: 0.5}
LAST_SEGMENT_MIN_SCHOOL_DEFAULT = 0.6


def last_segment_min_school(grade: int) -> float:
    return LAST_SEGMENT_MIN_SCHOOL.get(grade, LAST_SEGMENT_MIN_SCHOOL_DEFAULT)


STEP_TOLERANCE = 0.1  # a segment may dip this much below the previous one's school share

_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul}


def _eval(node: ast.expr) -> int:
    """Integer arithmetic only; exact division only. Anything else raises ValueError."""
    if isinstance(node, ast.Constant) and type(node.value) is int:
        return node.value
    if isinstance(node, ast.BinOp):
        left, right = _eval(node.left), _eval(node.right)
        if isinstance(node.op, ast.Div):
            if right == 0 or left % right:
                raise ValueError("not an exact division")
            return left // right
        if type(node.op) in _OPS:
            return _OPS[type(node.op)](left, right)
    raise ValueError("only integers and + - * / are allowed")


def check_math(episode: Episode) -> list[str]:
    problems = []
    for seg in episode.segments:
        for m in seg.math_checks:
            try:
                value = _eval(ast.parse(m.expr, mode="eval").body)
            except (SyntaxError, ValueError) as e:
                problems.append(f'{seg.id}: math_check "{m.expr}" is not valid ({e}).')
                continue
            if value != m.answer:
                problems.append(
                    f'{seg.id}: "{m.expr}" is {value}, not {m.answer}. Fix the episode text too.'
                )
    return problems


def school_shares(episode: Episode) -> list[float]:
    """Per segment: fraction of teach + core lines spoken in the school language."""
    shares = []
    for seg in episode.segments:
        lines = seg.teach + seg.core
        shares.append(sum(line.lang == episode.school_lang for line in lines) / len(lines))
    return shares


def check_bridge(episode: Episode) -> list[str]:
    if episode.home_lang == episode.school_lang:
        return []
    if len(episode.segments) < 2:
        return ["A language bridge needs at least 2 segments."]
    shares = school_shares(episode)
    pct = ", ".join(f"{s:.0%}" for s in shares)
    problems = []
    if 1 - shares[0] < FIRST_SEGMENT_MIN_HOME:
        problems.append(
            f"Segment 1 must be at least {FIRST_SEGMENT_MIN_HOME:.0%} home language "
            f"(school-language share per segment is now {pct})."
        )
    target = last_segment_min_school(episode.grade)
    if shares[-1] < target:
        problems.append(
            f"The last segment must be at least {target:.0%} school language "
            f"(school-language share per segment is now {pct}). Move more lines to the school "
            "language in later segments, keeping home-language support for new words."
        )
    for i in range(1, len(shares)):
        if shares[i] < shares[i - 1] - STEP_TOLERANCE:
            problems.append(
                f"School-language share drops from segment {i} to {i + 1} ({pct}); "
                "it should rise segment by segment."
            )
    return problems


def check(episode: Episode) -> list[str]:
    return check_math(episode) + check_bridge(episode)
