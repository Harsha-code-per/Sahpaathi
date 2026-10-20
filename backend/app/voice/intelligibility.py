"""Score the 3 m speaker intelligibility test (backend/app/voice/README.md).

Input CSV columns: listener,room,line,ok   (room = quiet|noisy, ok = 1 heard word for word, 0 not)
Run: python -m app.voice.intelligibility results.csv
Prints one line per listener and room, then the per-room verdict. Paste the summary into docs/TESTING_LOG.md.
"""

import csv
import sys
from collections import defaultdict

TARGET = {"quiet": 9, "noisy": 8}  # out of 10 lines, per listener


def score(rows: list[dict]) -> dict[tuple[str, str], list[int]]:
    """(room, listener) -> [lines understood, lines played]"""
    out: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    for r in rows:
        if r["room"] not in TARGET:
            raise ValueError(f"room must be quiet or noisy, got {r['room']!r}")
        cell = out[(r["room"], r["listener"])]
        cell[0] += int(r["ok"] == "1")
        cell[1] += 1
    return out


def verdict(scores: dict[tuple[str, str], list[int]]) -> dict[str, bool]:
    """A room passes when every listener reaches its target (scaled if fewer than 10 lines were played)."""
    ok: dict[str, bool] = {}
    for (room, _), (heard, played) in scores.items():
        ok[room] = ok.get(room, True) and heard * 10 >= TARGET[room] * played
    return ok


def main(path: str) -> None:
    with open(path, newline="", encoding="utf-8") as f:
        scores = score(list(csv.DictReader(f)))
    for (room, who), (heard, played) in sorted(scores.items()):
        print(f"{room:5} {who}: {heard}/{played}")
    for room, passed in sorted(verdict(scores).items()):
        print(f"{room}: {'PASS' if passed else 'FAIL'} (target {TARGET[room]}/10)")


if __name__ == "__main__":
    main(sys.argv[1])
