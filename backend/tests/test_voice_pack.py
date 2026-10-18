import json
import shutil
import subprocess
import zipfile
from pathlib import Path

import pytest

from app.factory.schema import Episode
from app.voice import signing
from app.voice.pack import PackError, build_pack, verify_pack

SAMPLE = Path(__file__).parents[2] / "content/samples/g1-counting-hi-ta.json"


@pytest.fixture
def episode() -> Episode:
    return Episode.model_validate_json(SAMPLE.read_text(encoding="utf-8"))


@pytest.fixture
def keys() -> tuple[str, str]:
    return signing.generate_keypair()


@pytest.fixture
def audio(episode: Episode, tmp_path: Path) -> dict[str, Path]:
    out = {}
    for line in episode.lines():
        f = tmp_path / f"{line.id}.opus"
        f.write_bytes(f"fake opus for {line.id}".encode())
        out[line.id] = f
    return out


def _rewrite(src: Path, dst: Path, change) -> Path:
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w") as zout:
        for name in zin.namelist():
            data = change(name, zin.read(name))
            if data is not None:
                zout.writestr(name, data)
    return dst


def test_sign_and_verify_roundtrip(keys):
    private, public = keys
    assert signing.public_from_private(private) == public
    hashes = {"b": "2", "a": "1"}
    sig = signing.sign(hashes, private)
    assert signing.verify({"a": "1", "b": "2"}, sig, public)  # key order is irrelevant
    assert not signing.verify({"a": "1", "b": "3"}, sig, public)
    assert not signing.verify(hashes, sig, signing.generate_keypair()[1])
    assert not signing.verify(hashes, "not base64!", public)


def test_pack_builds_and_verifies(episode, audio, keys, tmp_path):
    pack = build_pack(episode, audio, keys[0], tmp_path / "p.sahpaathi")
    assert verify_pack(pack, keys[1]) == episode
    with zipfile.ZipFile(pack) as zf:
        assert "sketch.svg" in zf.namelist()
        assert f"audio/{episode.analogy[0].id}.opus" in zf.namelist()


def test_pack_is_reproducible(episode, audio, keys, tmp_path):
    a = build_pack(episode, audio, keys[0], tmp_path / "a.sahpaathi")
    b = build_pack(episode, audio, keys[0], tmp_path / "b.sahpaathi")
    assert a.read_bytes() == b.read_bytes()


def test_missing_or_extra_audio_is_refused(episode, audio, keys, tmp_path):
    some = dict(audio)
    gone = some.popitem()[0]
    with pytest.raises(PackError, match=gone):
        build_pack(episode, some, keys[0], tmp_path / "p.sahpaathi")
    with pytest.raises(PackError, match="ghost"):
        build_pack(episode, {**audio, "ghost": next(iter(audio.values()))}, keys[0], tmp_path / "p")


def test_tampered_audio_is_rejected(episode, audio, keys, tmp_path):
    pack = build_pack(episode, audio, keys[0], tmp_path / "p.sahpaathi")
    first = f"audio/{episode.analogy[0].id}.opus"
    bad = _rewrite(pack, tmp_path / "bad", lambda n, d: b"evil" if n == first else d)
    with pytest.raises(PackError, match="changed after signing"):
        verify_pack(bad, keys[1])


def test_wrong_key_and_extra_file_are_rejected(episode, audio, keys, tmp_path):
    pack = build_pack(episode, audio, keys[0], tmp_path / "p.sahpaathi")
    with pytest.raises(PackError, match="signature"):
        verify_pack(pack, signing.generate_keypair()[1])
    with zipfile.ZipFile(pack, "a") as zf:
        zf.writestr("audio/extra.opus", b"x")
    with pytest.raises(PackError, match="signed list"):
        verify_pack(pack, keys[1])


def test_removed_file_and_garbage_are_rejected(episode, audio, keys, tmp_path):
    pack = build_pack(episode, audio, keys[0], tmp_path / "p.sahpaathi")
    cut = _rewrite(pack, tmp_path / "cut", lambda n, d: None if n == "sketch.svg" else d)
    with pytest.raises(PackError, match="signed list"):
        verify_pack(cut, keys[1])
    junk = tmp_path / "junk"
    junk.write_bytes(b"not a zip")
    with pytest.raises(PackError, match="not a valid pack"):
        verify_pack(junk, keys[1])


def test_episode_is_a_signed_file_not_inside_the_manifest(episode, audio, keys, tmp_path):
    pack = build_pack(episode, audio, keys[0], tmp_path / "p.sahpaathi")
    with zipfile.ZipFile(pack) as zf:
        manifest = json.loads(zf.read("manifest.json"))
        assert "episode" not in manifest  # the signature does not cover manifest.json
        assert "episode.json" in manifest["sha256"]
    edited = _rewrite(
        pack,
        tmp_path / "ed",
        lambda n, d: d + b" " if n == "episode.json" else d,
    )
    with pytest.raises(PackError, match="episode.json was changed"):
        verify_pack(edited, keys[1])


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_player_algorithm_accepts_our_signature(episode, audio, keys, tmp_path):
    """Replays app/src/packs/verify.ts in node: sorted-key JSON bytes + WebCrypto Ed25519."""
    pack = build_pack(episode, audio, keys[0], tmp_path / "p.sahpaathi")
    with zipfile.ZipFile(pack) as zf:
        manifest = json.loads(zf.read("manifest.json"))
    script = """
const [pub, sig, sha] = JSON.parse(require('fs').readFileSync(0, 'utf8'))
const sorted = Object.fromEntries(Object.keys(sha).sort().map((k) => [k, sha[k]]))
const b = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
crypto.subtle.importKey('raw', b(pub), { name: 'Ed25519' }, false, ['verify'])
  .then((k) => {
    const data = new TextEncoder().encode(JSON.stringify(sorted))
    return crypto.subtle.verify({ name: 'Ed25519' }, k, b(sig), data)
  })
  .then((ok) => process.stdout.write(String(ok)))
"""
    run = subprocess.run(
        ["node", "-e", script],
        input=json.dumps([keys[1], manifest["signature"], manifest["sha256"]]),
        capture_output=True, text=True, check=True,
    )  # fmt: skip
    assert run.stdout == "true"
