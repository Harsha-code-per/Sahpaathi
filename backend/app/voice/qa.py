"""Quality report for a built pack: size budget, loudness and length of every audio line.

Run on every pack before it goes to a classroom; paste the summary into docs/TESTING_LOG.md.
"""

import subprocess
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from app.voice.audio import TARGET_LUFS, AudioError, measure_lufs

MAX_PACK_KB = 2048  # "2 MB-class packs" (docs/ARCHITECTURE.md)
LUFS_TOLERANCE = 1.5
MAX_LINE_SEC = 45  # a line this long is hard for Grade 1 to 3 listeners; split it


@dataclass
class LineReport:
    line_id: str
    seconds: float
    lufs: float


@dataclass
class PackReport:
    size_kb: float
    lines: list[LineReport]
    problems: list[str] = field(default_factory=list)

    @property
    def total_sec(self) -> float:
        return sum(line.seconds for line in self.lines)


def _seconds(path: Path) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(path)],
            capture_output=True, text=True, check=True,
        )  # fmt: skip
        return float(out.stdout.strip())
    except (FileNotFoundError, subprocess.CalledProcessError, ValueError) as e:
        raise AudioError(f"could not read the length of {path.name}") from e


def inspect_pack(pack: Path) -> PackReport:
    """Measure every `audio/*.opus` in the pack. Does not check the signature (use verify_pack)."""
    report = PackReport(size_kb=pack.stat().st_size / 1024, lines=[])
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(pack) as zf:
        for name in sorted(n for n in zf.namelist() if n.startswith("audio/")):
            f = Path(tmp, Path(name).name)
            f.write_bytes(zf.read(name))
            line_id = f.stem
            lufs, secs = measure_lufs(f), _seconds(f)
            report.lines.append(LineReport(line_id, secs, lufs))
            if abs(lufs - TARGET_LUFS) > LUFS_TOLERANCE:
                report.problems.append(f"{line_id}: {lufs:.1f} LUFS, target {TARGET_LUFS:.0f}")
            if secs > MAX_LINE_SEC:
                report.problems.append(f"{line_id}: {secs:.0f} s long, over {MAX_LINE_SEC} s")
    if report.size_kb > MAX_PACK_KB:
        report.problems.append(f"pack is {report.size_kb:.0f} KB, over the {MAX_PACK_KB} KB budget")
    return report


def format_report(r: PackReport) -> str:
    out = [f"{r.size_kb:.0f} KB, {len(r.lines)} lines, {r.total_sec / 60:.1f} min of audio"]
    out += [f"  PROBLEM {p}" for p in r.problems] or ["  all checks passed"]
    return "\n".join(out)
