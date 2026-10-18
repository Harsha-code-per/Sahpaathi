"""Ed25519 signing for packs. Keys travel as base64 of the raw 32 bytes.

The signature covers the canonical JSON of the {path: sha256} map: keys sorted, no spaces.
The player rebuilds the same bytes before calling WebCrypto verify.
"""

import base64
import json

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)


def canonical(hashes: dict[str, str]) -> bytes:
    return json.dumps(hashes, sort_keys=True, separators=(",", ":")).encode()


def _public_b64(key: Ed25519PrivateKey) -> str:
    raw = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.b64encode(raw).decode()


def generate_keypair() -> tuple[str, str]:
    """Return (private, public) as base64. Private is PACK_SIGNING_KEY; public ships in the app."""
    key = Ed25519PrivateKey.generate()
    private = key.private_bytes(
        serialization.Encoding.Raw,
        serialization.PrivateFormat.Raw,
        serialization.NoEncryption(),
    )
    return base64.b64encode(private).decode(), _public_b64(key)


def public_from_private(private_b64: str) -> str:
    return _public_b64(Ed25519PrivateKey.from_private_bytes(base64.b64decode(private_b64)))


def sign(hashes: dict[str, str], private_b64: str) -> str:
    key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(private_b64))
    return base64.b64encode(key.sign(canonical(hashes))).decode()


def verify(hashes: dict[str, str], signature_b64: str, public_b64: str) -> bool:
    key = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_b64))
    try:
        key.verify(base64.b64decode(signature_b64), canonical(hashes))
    except (InvalidSignature, ValueError):
        return False
    return True
