"""The planted defects themselves: each mutant is schema-valid, changes only what it says, and the
tier-1 ones fail the code checks that the untouched episodes pass. No API calls."""

import pytest

from app.factory import eval_guardrails as ev
from app.factory import judge, rules

LIBRARY = ev.load_library()


@pytest.mark.parametrize("ep", [e for e, *_ in LIBRARY], ids=lambda e: e.id)
def test_untouched_library_episodes_pass_tier1(ep):
    assert rules.check(ep) == []


@pytest.mark.parametrize("m", ev.MUTATIONS, ids=lambda m: m.key)
def test_each_mutation_plants_its_defect(m):
    applied = 0
    for ep, *_ in LIBRARY:
        mt = ev.mutate(ep, m)
        if mt is None:
            continue
        applied += 1
        assert mt.episode != ep and mt.where  # changed, and we know where
        assert ev.mutate(ep, m).episode == mt.episode  # deterministic
        if m.tier1:
            assert rules.check(mt.episode), f"{m.key} should fail tier 1 on {ep.id}"
    assert applied, f"{m.key} applied to no library episode"


def test_scoring_counts_only_the_planted_defect():
    scores = {c: {"score": 5, "reason": "ok"} for c in judge.Scores.model_fields}
    clean = judge.Review(rubric={"scores": scores, "issues": []}, gloss=[])
    m = next(m for m in ev.MUTATIONS if m.key == "unsafe")
    hit = judge.Review(
        rubric={
            "scores": {**scores, "safety": {"score": 2, "reason": "mouth"}},
            "issues": [{"line_id": "s1-unsafe", "criterion": "safety", "problem": "p", "fix": "f"}],
        },
        gloss=[],
    )
    elsewhere = judge.Review(
        rubric={
            "scores": scores,
            "issues": [{"line_id": "s3-t1", "criterion": "safety", "problem": "p", "fix": "f"}],
        },
        gloss=[],
    )
    where = frozenset({"s1-unsafe"})
    assert ev.pinpointed(hit, m, where) and ev.score_drop(clean, hit, m)
    assert not ev.pinpointed(elsewhere, m, where) and not ev.score_drop(clean, elsewhere, m)
