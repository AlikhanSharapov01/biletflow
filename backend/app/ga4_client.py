"""HTTP access to GA4: Measurement Protocol for sending, Data API for aggregate reports.

The provider interface is two calls, ``send(payload)`` and ``run_report(property_id, body)``;
tests substitute a deterministic fixture. Credentials come only from settings (environment).
Provider URLs are fixed. Exceptions carry no message: provider errors and request URLs may echo
the Measurement Protocol secret or credentials.
"""

import json
import logging
import threading
import time

import httpx
import jwt

# httpx logs request URLs at INFO; the Measurement Protocol secret is a query parameter.
logging.getLogger("httpx").setLevel(logging.WARNING)

COLLECT_URL = "https://www.google-analytics.com/mp/collect"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REPORT_URL = "https://analyticsdata.googleapis.com/v1beta/properties/{}:runReport"
SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
TIMEOUT = 5


class GA4Unavailable(Exception):
    """Timeout, network failure, rate limit or provider 5xx: retry later."""


class GA4Error(Exception):
    """Rejected request or bad configuration (credentials, property access)."""


class GA4Client:
    def __init__(self, settings, transport=None):
        self.settings = settings
        self.transport = transport
        self.lock = threading.Lock()
        self.token, self.token_expires = None, 0.0

    def request(self, method, url, **kwargs):
        try:
            with httpx.Client(transport=self.transport, timeout=TIMEOUT) as client:
                response = client.request(method, url, **kwargs)
        except httpx.HTTPError:
            raise GA4Unavailable() from None
        if response.status_code == 429 or response.status_code >= 500:
            raise GA4Unavailable()
        if response.status_code >= 400:
            raise GA4Error()
        return response

    def send(self, payload):
        self.request(
            "POST",
            COLLECT_URL,
            params={
                "measurement_id": self.settings.ga4_measurement_id,
                "api_secret": self.settings.ga4_api_secret.get_secret_value(),
            },
            json=payload,
        )

    def access_token(self):
        with self.lock:
            if self.token and time.time() < self.token_expires - 60:
                return self.token
            try:
                account = json.loads(self.settings.ga4_credentials_json.get_secret_value())
                issued = int(time.time())
                assertion = jwt.encode(
                    {
                        "iss": account["client_email"],
                        "scope": SCOPE,
                        "aud": TOKEN_URL,
                        "iat": issued,
                        "exp": issued + 3600,
                    },
                    account["private_key"],
                    algorithm="RS256",
                )
            except (ValueError, KeyError, TypeError, jwt.PyJWTError):
                raise GA4Error() from None
            response = self.request(
                "POST",
                TOKEN_URL,
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    "assertion": assertion,
                },
            )
            try:
                data = response.json()
                self.token = data["access_token"]
                self.token_expires = time.time() + int(data.get("expires_in", 3600))
            except (ValueError, KeyError, TypeError):
                raise GA4Error() from None
            return self.token

    def run_report(self, property_id, body):
        response = self.request(
            "POST",
            REPORT_URL.format(property_id),
            headers={"Authorization": "Bearer " + self.access_token()},
            json=body,
        )
        try:
            data = response.json()
        except ValueError:
            raise GA4Error() from None
        if not isinstance(data, dict):
            raise GA4Error()
        return data
