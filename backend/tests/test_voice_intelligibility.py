from app.voice.intelligibility import score, verdict


def _rows(room, who, oks):
    return [
        {"listener": who, "room": room, "line": str(i), "ok": str(o)} for i, o in enumerate(oks)
    ]


def test_quiet_needs_9_of_10_and_noisy_8_of_10_for_every_listener():
    rows = _rows("quiet", "a", [1] * 9 + [0]) + _rows("noisy", "a", [1] * 8 + [0, 0])
    assert verdict(score(rows)) == {"quiet": True, "noisy": True}
    rows += _rows("quiet", "b", [1] * 8 + [0, 0])
    assert verdict(score(rows)) == {"quiet": False, "noisy": True}
