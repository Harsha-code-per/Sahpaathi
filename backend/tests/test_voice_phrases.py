import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.voice import phrases
from app.voice.splicer import SantaliVoice, load_phrasebank, split_into_phrases

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
SHEET = Path(__file__).parents[2] / "content/voices/santali/phrases.csv"


def _recording(path: Path, seconds: float = 1.0, rate: int = 44100) -> None:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
         "-i", f"sine=frequency=300:duration={seconds}:sample_rate={rate}", str(path)],
        check=True,
    )  # fmt: skip


def _sheet(path: Path, rows: list[tuple[str, str, str, str]], bom: bool = False) -> Path:
    lines = ["id,english,text,consent", *(",".join(r) for r in rows)]
    path.write_text(("﻿" if bom else "") + "\n".join(lines) + "\n", encoding="utf-8")
    return path


def test_committed_sheet_is_valid_and_has_no_filled_in_people_data():
    rows = phrases.read_sheet(SHEET)
    assert len(rows) >= 40
    assert all(r.id and r.english for r in rows)
    assert not any(r.consent for r in rows)  # consent ids are added locally with the recordings


@needs_ffmpeg
def test_import_converts_and_builds_a_bank_the_splicer_can_use(tmp_path):
    inbox, out = tmp_path / "inbox", tmp_path / "out"
    inbox.mkdir()
    _recording(inbox / "a.wav")
    _recording(inbox / "b.mp3", rate=22050)
    sheet = _sheet(
        tmp_path / "s.csv", [("a", "one", "AA", "form-1"), ("b", "two", "BB", "form-1")], bom=True
    )
    result = phrases.import_recordings(sheet, inbox, out)
    assert result.imported == ["a", "b"] and not result.skipped
    bank = load_phrasebank(out)
    assert [p.text for p in split_into_phrases("AA BB", bank)] == ["AA", "BB"]
    assert SantaliVoice(out).synthesize("AA BB", "sat", "guide", tmp_path / "x.wav").exists()


@needs_ffmpeg
def test_incomplete_rows_are_skipped_with_reasons(tmp_path):
    inbox, out = tmp_path / "inbox", tmp_path / "out"
    inbox.mkdir()
    for n in ("ok", "notext", "noconsent"):
        _recording(inbox / f"{n}.wav")
    _recording(inbox / "tiny.wav", seconds=0.05)
    sheet = _sheet(
        tmp_path / "s.csv",
        [("ok", "x", "OK", "f1"), ("notext", "x", "", "f1"), ("noconsent", "x", "T", ""),
         ("norec", "x", "R", "f1"), ("tiny", "x", "S", "f1")],
    )  # fmt: skip
    r = phrases.import_recordings(sheet, inbox, out)
    assert r.imported == ["ok"]
    assert r.skipped["notext"] == "no text yet"
    assert r.skipped["noconsent"] == "no consent reference"
    assert r.skipped["norec"] == "no recording in the inbox"
    assert "0.0 s" in r.skipped["tiny"] or "0.1 s" in r.skipped["tiny"]
    assert not (out / "clips/tiny.wav").exists()


@needs_ffmpeg
def test_reimport_keeps_earlier_clips_and_never_writes_an_empty_bank(tmp_path):
    inbox, out = tmp_path / "inbox", tmp_path / "out"
    inbox.mkdir()
    _recording(inbox / "a.wav")
    sheet = _sheet(tmp_path / "s.csv", [("a", "one", "AA", "f1")])
    phrases.import_recordings(sheet, inbox, out)
    before = (out / "phrasebank.json").read_text(encoding="utf-8")
    (inbox / "a.wav").unlink()  # a different machine, no inbox: the clip already in the bank stays
    assert phrases.import_recordings(sheet, inbox, out).imported == ["a"]
    assert (out / "phrasebank.json").read_text(encoding="utf-8") == before
    empty = _sheet(tmp_path / "e.csv", [("z", "none", "", "")])
    phrases.import_recordings(empty, inbox, out)
    assert json.loads((out / "phrasebank.json").read_text(encoding="utf-8"))  # untouched


def test_duplicate_or_missing_ids_are_rejected(tmp_path):
    with pytest.raises(ValueError, match="unique id"):
        phrases.read_sheet(_sheet(tmp_path / "s.csv", [("a", "x", "", ""), ("a", "y", "", "")]))
    with pytest.raises(ValueError, match="unique id"):
        phrases.read_sheet(_sheet(tmp_path / "t.csv", [("", "x", "", "")]))


@needs_ffmpeg
def test_cli_status_and_import(tmp_path, capsys):
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    _recording(inbox / "a.wav")
    sheet = _sheet(tmp_path / "s.csv", [("a", "one", "AA", "f1"), ("b", "two", "", "")])
    assert phrases.main(["status", str(sheet), str(inbox)]) == 0
    out = capsys.readouterr().out
    assert "1/2 phrases complete" in out and "b: needs text, consent, recording" in out
    assert phrases.main(["import", str(sheet), str(inbox), "-o", str(tmp_path / "o")]) == 0
    assert "imported 1 phrases" in capsys.readouterr().out


@needs_ffmpeg
def test_texts_command_prints_the_list_the_scriptwriter_takes(tmp_path, capsys):
    inbox, out = tmp_path / "inbox", tmp_path / "out"
    inbox.mkdir()
    _recording(inbox / "a.wav")
    phrases.import_recordings(_sheet(tmp_path / "s.csv", [("a", "one", "AA", "f1")]), inbox, out)
    assert phrases.main(["texts", str(out)]) == 0
    assert json.loads(capsys.readouterr().out) == ["AA"]
