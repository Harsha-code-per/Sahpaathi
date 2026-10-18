"""Turn phone recordings of Santali phrases into the phrase bank the splicer reads.

Workflow (details in backend/app/voice/README.md):
  1. A native speaker fills `text` (Ol Chiki) and `consent` (signed form id) in phrases.csv.
  2. Recordings go in a local inbox folder, one file per phrase named `<id>.<wav|m4a|mp3|ogg|opus>`.
  3. `python -m app.voice.phrases import phrases.csv INBOX -o content/voices/santali`
     converts each clip to 24 kHz mono WAV, trims silence, and writes clips/ + phrasebank.json.
Rows missing text, consent or audio are skipped and listed, never imported.
"""

import argparse
import csv
import json
import subprocess
import sys
import wave
from dataclasses import dataclass
from pathlib import Path

from app.voice.audio import AudioError
from app.voice.splicer import BANK_FILE, load_phrasebank

RATE = 24000
EXTENSIONS = (".wav", ".m4a", ".mp3", ".ogg", ".opus", ".aac", ".flac")
MIN_SEC, MAX_SEC = 0.2, 15.0


@dataclass
class Row:
    id: str
    english: str
    text: str
    consent: str


@dataclass
class ImportResult:
    imported: list[str]
    skipped: dict[str, str]  # phrase id -> reason


def read_sheet(path: Path) -> list[Row]:
    """phrases.csv with columns id, english, text, consent (Excel's BOM is tolerated)."""
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = [
            Row(
                (r.get("id") or "").strip(),
                (r.get("english") or "").strip(),
                (r.get("text") or "").strip(),
                (r.get("consent") or "").strip(),
            )
            for r in csv.DictReader(f)
        ]
    ids = [r.id for r in rows]
    if "" in ids or len(set(ids)) != len(ids):
        raise ValueError("every row needs a unique id")
    return rows


def _find_recording(inbox: Path, phrase_id: str) -> Path | None:
    return next((p for e in EXTENSIONS if (p := inbox / f"{phrase_id}{e}").exists()), None)


def _convert(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    trim = "silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=1:stop_threshold=-45dB"
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(src),
        "-af", trim, "-ac", "1", "-ar", str(RATE), "-sample_fmt", "s16", str(dst),
    ]  # fmt: skip
    try:
        run = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    except FileNotFoundError as e:
        raise AudioError("ffmpeg is not installed or not on PATH") from e
    if run.returncode != 0:
        raise AudioError(run.stderr.strip()[-200:] or "ffmpeg failed")


def _seconds(wav: Path) -> float:
    with wave.open(str(wav)) as w:
        return w.getnframes() / w.getframerate()


def _gaps(row: Row, inbox: Path) -> list[str]:
    """What a row still needs before it can be imported."""
    missing = [("text", not row.text), ("consent", not row.consent)]
    missing.append(("recording", _find_recording(inbox, row.id) is None))
    return [name for name, bad in missing if bad]


def import_recordings(sheet: Path, inbox: Path, out_dir: Path) -> ImportResult:
    """Convert every complete row into `out_dir/clips/<id>.wav` and rewrite phrasebank.json."""
    result = ImportResult([], {})
    bank = []
    for row in read_sheet(sheet):
        src = _find_recording(inbox, row.id)
        clip = out_dir / "clips" / f"{row.id}.wav"
        if not row.text:
            result.skipped[row.id] = "no text yet"
        elif not row.consent:
            result.skipped[row.id] = "no consent reference"
        elif src is None and not clip.exists():
            result.skipped[row.id] = "no recording in the inbox"
        else:
            if src is not None:  # a clip imported earlier is reused when the inbox no longer has it
                try:
                    _convert(src, clip)
                except AudioError as e:
                    result.skipped[row.id] = f"could not convert: {e}"
                    continue
            secs = _seconds(clip)
            if not MIN_SEC <= secs <= MAX_SEC:
                clip.unlink()
                result.skipped[row.id] = f"clip is {secs:.1f} s (want {MIN_SEC} to {MAX_SEC} s)"
                continue
            bank.append({"text": row.text, "clip": f"clips/{row.id}.wav", "consent": row.consent})
            result.imported.append(row.id)
    if bank:  # never replace an existing bank with an empty one
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / BANK_FILE).write_text(
            json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    return result


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m app.voice.phrases")
    sub = ap.add_subparsers(dest="cmd", required=True)
    imp = sub.add_parser("import", help="convert recordings and write phrasebank.json")
    imp.add_argument("sheet", type=Path)
    imp.add_argument("inbox", type=Path)
    imp.add_argument("-o", "--out", type=Path, required=True)
    st = sub.add_parser("status", help="show what is still missing from the sheet")
    st.add_argument("sheet", type=Path)
    st.add_argument("inbox", type=Path)
    tx = sub.add_parser(
        "texts", help="print the bank's phrases as the JSON list the scriptwriter takes"
    )
    tx.add_argument("bank_dir", type=Path)
    args = ap.parse_args(argv)

    if args.cmd == "texts":
        texts = [p.text for p in load_phrasebank(args.bank_dir)]
        print(json.dumps(texts, ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "status":
        rows = read_sheet(args.sheet)
        todo = {r.id: (r, _gaps(r, args.inbox)) for r in rows if _gaps(r, args.inbox)}
        print(f"{len(rows) - len(todo)}/{len(rows)} phrases complete")
        for pid, (r, gaps) in todo.items():
            print(f"  {pid}: needs {', '.join(gaps)}  ({r.english})")
        return 0

    try:
        result = import_recordings(args.sheet, args.inbox, args.out)
    except (ValueError, AudioError) as e:
        print(f"import failed: {e}", file=sys.stderr)
        return 1
    print(f"imported {len(result.imported)} phrases into {args.out}")
    for pid, why in result.skipped.items():
        print(f"  skipped {pid}: {why}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
