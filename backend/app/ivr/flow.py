"""The absentee call as a tiny state machine, independent of who carries the call.

The admin keypad simulator and a real phone provider (Exotel or Twilio) both drive this: they
play what a `Step` says, collect one keypad digit if it asks for one, and send it to `press`.

    start      -> play the recap, then the menu, and wait for a digit
    1          -> hear it all again (up to MAX_PLAYS times in total)
    2          -> "my child understood": call ends, outcome `understood`
    3          -> "we need help": call ends, outcome `help`, so the teacher can follow up
    no/other   -> repeat the menu; after MAX_MISSED misses the call ends with no outcome
"""

from dataclasses import dataclass

MAX_PLAYS = 3
MAX_MISSED = 2


@dataclass(frozen=True)
class Step:
    play: tuple[str, ...]  # audio names to play in order: "recap", "menu"
    gather: bool  # wait for one keypad digit after playing
    hangup: bool
    outcome: str | None = None  # "understood" or "help" when the parent answered


@dataclass(frozen=True)
class Progress:
    plays: int = 0  # how many times the recap has been played
    missed: int = 0  # menus that got no usable digit


def start() -> tuple[Step, Progress]:
    return Step(("recap", "menu"), gather=True, hangup=False), Progress(plays=1)


def press(digit: str | None, progress: Progress) -> tuple[Step, Progress]:
    """`digit` is "0" to "9", "*" or "#", or None when the parent pressed nothing in time."""
    if digit == "2":
        return Step((), gather=False, hangup=True, outcome="understood"), progress
    if digit == "3":
        return Step((), gather=False, hangup=True, outcome="help"), progress
    if digit == "1":
        if progress.plays >= MAX_PLAYS:
            return Step((), gather=False, hangup=True), progress
        step = Step(("recap", "menu"), gather=True, hangup=False)
        return step, Progress(progress.plays + 1, progress.missed)
    missed = progress.missed + 1
    if missed >= MAX_MISSED:
        return Step((), gather=False, hangup=True), Progress(progress.plays, missed)
    return Step(("menu",), gather=True, hangup=False), Progress(progress.plays, missed)
