"""Episode to signed pack: voice every line, normalise to opus, sign and zip.

CLI:
  python -m app.voice.build keygen
  python -m app.voice.build pack <episode.json> -o <out.sahpaathi> [--recap out.wav] [--fake]
                                 [--santali DIR]
  python -m app.voice.build qa <pack.sahpaathi>

Needs ffmpeg on PATH, PACK_SIGNING_KEY (see `keygen`) and, unless --fake, TTS_API_KEY.
"""

import argparse
import sys
import tempfile
from pathlib import Path

from app.factory.schema import Episode, Lang
from app.voice import signing
from app.voice.audio import AudioError, normalize_to_opus
from app.voice.pack import build_pack
from app.voice.qa import format_report, inspect_pack
from app.voice.recap import build_ivr_recap
from app.voice.sarvam import SarvamTTS
from app.voice.settings import VoiceSettings
from app.voice.splicer import SantaliVoice
from app.voice.tts import FakeTTS, TTSError, TTSProvider, synthesize_episode

SANTALI_DIR = Path(__file__).parents[3] / "content/voices/santali"


class MultiVoice:
    """Routes each line to the provider that speaks its language."""

    def __init__(self, *providers: TTSProvider):
        self.providers = providers
        self.languages: frozenset[Lang] = frozenset().union(*(p.languages for p in providers))

    def synthesize(self, text: str, lang: Lang, speaker: str, dst: Path) -> Path:
        for p in self.providers:
            if lang in p.languages:
                return p.synthesize(text, lang, speaker, dst)
        raise TTSError(f"no voice for {lang!r}")


def build_episode_pack(
    episode: Episode,
    voice: TTSProvider,
    private_key_b64: str,
    out_path: Path,
    recap_path: Path | None = None,
) -> Path:
    """Write the signed pack; with `recap_path`, also the 8 kHz IVR recap WAV for absentee calls."""
    with tempfile.TemporaryDirectory() as tmp:
        raw, opus = Path(tmp, "raw"), Path(tmp, "opus")
        wavs = synthesize_episode(episode, voice, raw)
        audio = {i: normalize_to_opus(f, opus / f"{i}.opus") for i, f in wavs.items()}
        if recap_path is not None:
            build_ivr_recap(episode, wavs, recap_path)
        return build_pack(episode, audio, private_key_b64, out_path)


def _voice(fake: bool, santali_dir: Path | None, api_key: str) -> TTSProvider:
    providers: list[TTSProvider] = [FakeTTS() if fake else SarvamTTS(api_key)]
    if santali_dir is not None:
        providers.append(SantaliVoice(santali_dir))
    return MultiVoice(*providers)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m app.voice.build")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("keygen", help="print a new Ed25519 keypair")
    p = sub.add_parser("pack", help="voice an episode and write a signed .sahpaathi pack")
    p.add_argument("episode", type=Path)
    p.add_argument("-o", "--out", type=Path, required=True)
    p.add_argument("--recap", type=Path, default=None, help="also write the IVR recap WAV here")
    p.add_argument("--fake", action="store_true", help="tones instead of speech; no API key needed")
    p.add_argument("--santali", type=Path, default=None, help=f"phrase bank dir ({SANTALI_DIR})")
    q = sub.add_parser("qa", help="report size, loudness and length of a built pack")
    q.add_argument("pack", type=Path)
    args = ap.parse_args(argv)

    if args.cmd == "qa":
        report = inspect_pack(args.pack)
        print(format_report(report))
        return 1 if report.problems else 0

    if args.cmd == "keygen":
        private, public = signing.generate_keypair()
        print(f"PACK_SIGNING_KEY={private}")
        print(f"PUBLIC_KEY={public}")
        print("Private key goes in backend/.env; only the public key ships.", file=sys.stderr)
        return 0

    cfg = VoiceSettings()
    if not cfg.pack_signing_key:
        print(
            "PACK_SIGNING_KEY is not set. Run `keygen` and put it in backend/.env.", file=sys.stderr
        )
        return 2
    episode = Episode.model_validate_json(args.episode.read_text(encoding="utf-8"))
    try:
        voice = _voice(args.fake, args.santali, cfg.tts_api_key)
        out = build_episode_pack(episode, voice, cfg.pack_signing_key, args.out, args.recap)
    except (TTSError, AudioError) as e:
        print(f"voice failed: {e}", file=sys.stderr)
        return 1
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
