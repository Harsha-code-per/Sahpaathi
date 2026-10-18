from pathlib import Path

import pytest
from stub_client import stub_client

from app.factory.judge import (
    Gloss,
    GlossLine,
    Issue,
    JudgeError,
    Review,
    Rubric,
    Score,
    Scores,
    generate,
    review,
)
from app.factory.schema import Episode
from app.factory.scriptwriter import District, Lesson

CONTENT = Path(__file__).parents[2] / "content"
SAMPLE = (CONTENT / "samples/g1-counting-hi-ta.json").read_text()
EPISODE = Episode.model_validate_json(SAMPLE)
LESSON = Lesson.model_validate_json((CONTENT / "curriculum/g1-numbers-to-20.json").read_text())
DISTRICT = District.model_validate_json((CONTENT / "districts/chennai-migrant.json").read_text())
GLOSS = Gloss(lines=[GlossLine(line_id=x.id, english="gloss") for x in EPISODE.lines()])


def _rubric(low: str | None = None, issues: tuple[Issue, ...] = ()) -> Rubric:
    names = Scores.model_fields
    scores = {c: Score(score=3 if c == low else 5, reason=f"{c} reason") for c in names}
    return Rubric(scores=Scores(**scores), issues=list(issues))


SEED_ISSUE = Issue(line_id="s1-t1", criterion="safety", problem="Seeds.", fix="Warn.")


def test_review_passes_only_without_low_scores_or_safety_issues():
    assert Review(rubric=_rubric(), gloss=[]).passed
    low = Review(rubric=_rubric(low="age_fit"), gloss=[])
    assert not low.passed and low.problems() == ["Reviewer scored age_fit 3/5: age_fit reason"]
    unsafe = Review(rubric=_rubric(issues=(SEED_ISSUE,)), gloss=[])
    assert not unsafe.passed and "s1-t1 (safety): Seeds. Fix: Warn." in unsafe.problems()


def test_gloss_is_blind_and_rubric_sees_gloss_but_not_svg():
    client = stub_client(judge=[GLOSS, _rubric()])
    result = review(EPISODE, LESSON, DISTRICT, client)
    gloss_req, rubric_req = client.requests["judge"]
    assert gloss_req["model"] == "claude-haiku-5-5"
    gloss_prompt = gloss_req["messages"][0]["content"]
    assert '"line_id": "s1-t1"' in gloss_prompt and LESSON.nipun_lo not in gloss_prompt
    rubric_prompt = rubric_req["messages"][0]["content"]
    assert "s1-t1: gloss" in rubric_prompt and "<svg" not in rubric_prompt
    assert result.passed and len(result.gloss) == len(EPISODE.lines())


def test_judge_refusal_raises():
    with pytest.raises(JudgeError, match="refusal"):
        review(EPISODE, LESSON, DISTRICT, stub_client(judge=["refusal"]))


def test_passing_review_needs_no_repair():
    client = stub_client(writer=[(SAMPLE, "end_turn")], judge=[GLOSS, _rubric()])
    episode, result = generate(LESSON, DISTRICT, client=client)
    assert result.passed and len(client.requests["writer"]) == 1
    assert episode.id == "g1-numbers-to-20-chennai-migrant"


def test_failed_review_earns_one_repair_then_never_blocks():
    client = stub_client(
        writer=[(SAMPLE, "end_turn"), (SAMPLE, "end_turn")],
        judge=[GLOSS, _rubric(issues=(SEED_ISSUE,)), GLOSS, _rubric(low="pedagogy")],
    )
    episode, result = generate(LESSON, DISTRICT, client=client)
    repair = client.requests["writer"][1]["messages"][-1]["content"]
    assert "s1-t1 (safety): Seeds. Fix: Warn." in repair
    # Second review still fails, but the episode is returned for the human reviewer to decide.
    assert not result.passed and result.rubric.scores.pedagogy.score == 3
    assert episode.id == "g1-numbers-to-20-chennai-migrant"
