"""Build and verify `.sahpaathi` packs (layout in docs/EPISODE_SCHEMA.md)."""

import hashlib
import json
import zipfile
from pathlib import Path

from app.factory.schema import Episode
from app.voice import signing

_EPOCH = (2026, 1, 1, 0, 0, 0)  # fixed timestamp: same inputs give a byte-identical pack


class PackError(ValueError):
    """A pack that cannot be built or fails verification."""


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _add(zf: zipfile.ZipFile, name: str, data: bytes) -> None:
    info = zipfile.ZipInfo(name, _EPOCH)
    info.compress_type = zipfile.ZIP_DEFLATED
    zf.writestr(info, data)


def build_pack(
    episode: Episode, audio: dict[str, Path], private_key_b64: str, out_path: Path
) -> Path:
    """Write a signed pack. `audio` maps every line id of the episode to its .opus file."""
    ids = {line.id for line in episode.lines()}
    missing = sorted(ids - audio.keys())
    if missing:
        raise PackError(f"no audio for lines: {missing}")
    unknown = sorted(audio.keys() - ids)
    if unknown:
        raise PackError(f"audio for lines not in the episode: {unknown}")

    files = {f"audio/{i}.opus": audio[i].read_bytes() for i in sorted(ids)}
    files["sketch.svg"] = episode.chalk_sketch_svg.encode()
    # The episode is a signed file, not part of manifest.json: the signature only covers `sha256`.
    files["episode.json"] = episode.model_dump_json().encode()
    hashes = {name: _sha256(data) for name, data in files.items()}
    manifest = {
        "audio": {i: f"audio/{i}.opus" for i in sorted(ids)},
        "sha256": hashes,
        "signature": signing.sign(hashes, private_key_b64),
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out_path, "w") as zf:
        _add(zf, "manifest.json", json.dumps(manifest, ensure_ascii=False).encode())
        for name, data in files.items():
            _add(zf, name, data)
    return out_path


def verify_pack(path: Path, public_key_b64: str) -> Episode:
    """Check signature, hashes and file list the way the player does. Returns the episode."""
    try:
        zf = zipfile.ZipFile(path)
    except zipfile.BadZipFile as e:
        raise PackError("not a valid pack file") from e
    with zf:
        try:
            manifest = json.loads(zf.read("manifest.json"))
            hashes: dict[str, str] = manifest["sha256"]
            signature: str = manifest["signature"]
        except (KeyError, ValueError) as e:
            raise PackError("manifest is missing or malformed") from e
        if not signing.verify(hashes, signature, public_key_b64):
            raise PackError("signature does not match: pack was not made by Sahpaathi")
        if set(zf.namelist()) - {"manifest.json"} != set(hashes):
            raise PackError("pack files do not match the signed list")
        if "episode.json" not in hashes:
            raise PackError("pack has no signed episode.json")
        for name, expected in hashes.items():
            if _sha256(zf.read(name)) != expected:
                raise PackError(f"{name} was changed after signing")
        return Episode.model_validate_json(zf.read("episode.json"))
