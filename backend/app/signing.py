"""Asymmetric signatures for tokens that devices must verify without the server.

Each token purpose gets its own Ed25519 key, derived from CHALLENGE_SECRET and the purpose
name, so a signature made for one purpose can never verify under another. The ticket QR
stays an HMAC (purpose "ticket_qr" in checkout) and is not interchangeable with these.
"""

import base64
import hashlib
import hmac
import json

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

ENTRY_PURPOSE = "entry_confirmation"
PACKAGE_PURPOSE = "offline_package"
ENTRY_PREFIX = "biletflow:entry:"


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def private_key(settings, purpose):
    seed = hmac.new(
        settings.challenge_secret.get_secret_value().encode(),
        f"ed25519-signing-key:{purpose}".encode(),
        hashlib.sha256,
    ).digest()
    return Ed25519PrivateKey.from_private_bytes(seed)


def public_bytes(settings, purpose) -> bytes:
    return (
        private_key(settings, purpose)
        .public_key()
        .public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    )


def public_key_b64(settings, purpose) -> str:
    return b64(public_bytes(settings, purpose))


def key_id(settings, purpose) -> str:
    return hashlib.sha256(public_bytes(settings, purpose)).hexdigest()[:16]


def sign(settings, purpose, message: bytes) -> str:
    # The purpose is part of the signed bytes as well as of the key (defense in depth).
    return b64(private_key(settings, purpose).sign(purpose.encode() + b"\0" + message))


def verify(settings, purpose, message: bytes, signature: str) -> bool:
    try:
        public = Ed25519PublicKey.from_public_bytes(public_bytes(settings, purpose))
        public.verify(unb64(signature), purpose.encode() + b"\0" + message)
        return True
    except (InvalidSignature, ValueError):
        return False


def canonical(data) -> bytes:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def entry_token(settings, claims: dict) -> str:
    body = canonical(claims)
    return f"{ENTRY_PREFIX}{b64(body)}.{sign(settings, ENTRY_PURPOSE, body)}"


def read_entry_token(settings, token: str):
    """Return the claims of a genuine entry-confirmation token, or None."""
    if not token.startswith(ENTRY_PREFIX):
        return None
    try:
        body_part, signature = token.removeprefix(ENTRY_PREFIX).split(".", 1)
        body = unb64(body_part)
        if not verify(settings, ENTRY_PURPOSE, body, signature):
            return None
        claims = json.loads(body)
    except (ValueError, TypeError):
        return None
    return claims if isinstance(claims, dict) else None


def unverified_claims(token: str):
    """Claims of a token WITHOUT checking its signature; only to retain what a device claimed."""
    body_part = token.removeprefix(ENTRY_PREFIX).split(".", 1)[0]
    claims = json.loads(unb64(body_part))
    if not isinstance(claims, dict):
        raise ValueError("not a claims object")
    return claims
