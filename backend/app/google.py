import hmac

import httpx
import jwt
from pydantic import EmailStr, TypeAdapter, ValidationError

from .security import fail


class GoogleClient:
    # Fixed provider URLs; never fetch a caller-supplied issuer or JWKS URL.
    def __init__(self, settings):
        self.settings = settings
        self.keys = jwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs", timeout=10)

    def exchange(self, code, verifier):
        try:
            response = httpx.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": self.settings.google_client_id,
                    "client_secret": self.settings.google_client_secret.get_secret_value(),
                    "redirect_uri": self.settings.google_redirect_uri,
                    "code_verifier": verifier,
                },
                timeout=10,
            )
            response.raise_for_status()
            return response.json()["id_token"]
        except (httpx.HTTPError, ValueError, KeyError):
            fail("google_exchange_failed", 502)

    def verify(self, token, nonce):
        try:
            key = self.keys.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                key.key,
                algorithms=["RS256"],
                audience=self.settings.google_client_id,
                issuer=["https://accounts.google.com", "accounts.google.com"],
                options={
                    "require": [
                        "iss",
                        "sub",
                        "aud",
                        "exp",
                        "iat",
                        "nonce",
                        "email",
                        "email_verified",
                    ]
                },
            )
            if (
                claims["email_verified"] is not True
                or not isinstance(claims["sub"], str)
                or not claims["sub"]
                or len(claims["sub"]) > 255
                or not isinstance(claims["nonce"], str)
                or not hmac.compare_digest(claims["nonce"], nonce)
                or claims.get("azp", self.settings.google_client_id)
                != self.settings.google_client_id
                or (
                    isinstance(claims["aud"], list)
                    and len(claims["aud"]) > 1
                    and not claims.get("azp")
                )
            ):
                fail("invalid_google_identity")
            claims["email"] = str(TypeAdapter(EmailStr).validate_python(claims["email"])).lower()
            return claims
        except jwt.PyJWKClientConnectionError:
            fail("google_unavailable", 503)
        except (jwt.PyJWTError, ValueError, TypeError, ValidationError):
            fail("invalid_google_identity")
