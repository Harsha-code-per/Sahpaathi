from pathlib import Path

from app.factory import rules
from app.factory.schema import Episode

SAMPLES = Path(__file__).parents[2] / "content/samples"


def _load(name: str) -> Episode:
    return Episode.model_validate_json((SAMPLES / f"{name}.json").read_text())


def test_fixture_passes_all_rules():
    assert rules.check(_load("g1-counting-hi-ta")) == []


def test_first_generated_episode_fails_bridge_handover():
    # Real Sonnet output before the bridge rule existed: Hindi never handed over to Tamil.
    problems = rules.check_bridge(_load("g1-numbers-to-20-chennai-migrant"))
    assert any("last segment must be at least 60%" in p for p in problems)
    assert any("drops from segment 3 to 4" in p for p in problems)


def test_bridge_needs_home_language_first():
    ep = _load("g1-counting-hi-ta")
    for line in ep.segments[0].teach + ep.segments[0].core:
        line.lang = "ta"
    assert any("Segment 1 must be at least 50% home" in p for p in rules.check_bridge(ep))


def test_same_language_episode_skips_bridge():
    ep = _load("g1-counting-hi-ta").model_copy(update={"home_lang": "ta"})
    assert rules.check_bridge(ep) == []


def test_math_checks_catch_wrong_answers_and_unsafe_exprs():
    ep = _load("g1-counting-hi-ta")
    checks = ep.segments[0].math_checks
    checks[0].answer = 4  # 1 + 1 + 1
    checks[1].expr = "__import__('os').getcwd()"
    ep.segments[1].math_checks[0].expr = "7 / 2"
    problems = rules.check_math(ep)
    assert '"1 + 1 + 1" is 3, not 4' in problems[0]
    assert "only integers" in problems[1]
    assert "exact division" in problems[2]
    assert len(problems) == 3
