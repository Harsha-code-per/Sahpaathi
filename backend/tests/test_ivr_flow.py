from app.ivr.flow import MAX_MISSED, MAX_PLAYS, Progress, Step, press, start


def test_the_call_opens_with_the_recap_then_the_menu():
    step, progress = start()
    assert step == Step(("recap", "menu"), gather=True, hangup=False)
    assert progress == Progress(plays=1, missed=0)


def test_two_and_three_end_the_call_with_an_outcome():
    _, p = start()
    assert press("2", p)[0] == Step((), gather=False, hangup=True, outcome="understood")
    assert press("3", p)[0] == Step((), gather=False, hangup=True, outcome="help")


def test_one_replays_up_to_the_limit_then_hangs_up_without_an_outcome():
    step, p = start()
    for _ in range(MAX_PLAYS - 1):
        step, p = press("1", p)
        assert step.play == ("recap", "menu") and step.gather and not step.hangup
    assert p.plays == MAX_PLAYS
    step, _ = press("1", p)
    assert step.hangup and step.outcome is None


def test_no_digit_or_a_wrong_one_repeats_the_menu_then_gives_up():
    _, p = start()
    step, p = press(None, p)
    assert step == Step(("menu",), gather=True, hangup=False)
    step, p = press("7", p)  # a key the menu does not offer counts as a miss too
    assert step.hangup and step.outcome is None
    assert p.missed == MAX_MISSED == 2


def test_an_answer_after_a_miss_still_counts():
    _, p = start()
    _, p = press("*", p)
    assert press("3", p)[0].outcome == "help"


def test_a_replay_keeps_the_misses_so_far():
    _, p = start()
    _, p = press(None, p)
    _, p = press("1", p)
    assert p == Progress(plays=2, missed=1)
