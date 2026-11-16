"""Private object storage behind a small interface.

Keys are `/`-separated relative paths such as `support/<case_id>/<file_id>`. Nothing here is
served publicly; callers decide who may read an object and hand out only short-lived signed
links (see attachment_service). `storage_from_settings` picks the backend: `LocalFileStorage`
(STORAGE_ROOT; local development and tests) or `S3FileStorage`, a private bucket on an
S3-compatible service (the Docker stack's MinIO, #77).

Both raise FileNotFoundError for a missing object and another OSError when storage fails, so
callers answer `404` and `503 storage_unavailable` the same way for either backend.
"""

import contextlib
import hashlib
import hmac
import os
import tempfile
import xml.etree.ElementTree as ElementTree
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol
from urllib.parse import parse_qsl, quote, urlsplit

import httpx


class FileStorage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...

    def get(self, key: str) -> bytes:
        """Raise FileNotFoundError when the object does not exist."""
        ...

    def delete(self, key: str) -> None:
        """Idempotent: deleting a missing object is not an error."""
        ...


def checked_key(key: str) -> str:
    parts = key.split("/")
    if (
        not key
        or key.startswith("/")
        or any(part in ("", ".", "..") for part in parts)
        or "\\" in key
        or "\0" in key
    ):
        raise ValueError("Invalid storage key")
    return key


class LocalFileStorage:
    def __init__(self, root):
        self.root = Path(root).resolve()

    def path(self, key: str) -> Path:
        return self.root.joinpath(*checked_key(key).split("/"))

    def put(self, key: str, data: bytes) -> None:
        target = self.path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        # Same directory, so os.replace is atomic: readers never see a partial object.
        descriptor, temporary = tempfile.mkstemp(dir=target.parent, prefix=".upload-")
        try:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(data)
            os.replace(temporary, target)
        except BaseException:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(temporary)
            raise

    def get(self, key: str) -> bytes:
        return self.path(key).read_bytes()

    def delete(self, key: str) -> None:
        with contextlib.suppress(FileNotFoundError):
            self.path(key).unlink()


class StorageError(OSError):
    """The object store refused a request or could not be reached. The message names only the
    operation and the status or error type: never a key, URL or credential."""


def _encode(value: str, safe: str = "") -> str:
    return quote(value, safe="-_.~" + safe)


def sign_v4(
    method: str,
    path: str,
    query: str,
    headers: dict[str, str],
    payload_sha256: str,
    *,
    access_key_id: str,
    secret_access_key: str,
    region: str,
    service: str,
) -> str:
    """The `Authorization` value for AWS Signature Version 4 (header-based).

    `path` is the URI-encoded path exactly as sent; `query` the query string as sent (any order).
    `headers` are the headers to sign and must include `host` and `x-amz-date`.
    """
    headers = {name.lower(): " ".join(value.split()) for name, value in headers.items()}
    amz_date = headers["x-amz-date"]
    signed_headers = ";".join(sorted(headers))
    canonical_query = "&".join(
        f"{_encode(name)}={_encode(value)}"
        for name, value in sorted(parse_qsl(query, keep_blank_values=True))
    )
    canonical_request = "\n".join(
        [
            method,
            path or "/",
            canonical_query,
            "".join(f"{name}:{headers[name]}\n" for name in sorted(headers)),
            signed_headers,
            payload_sha256,
        ]
    )
    scope = f"{amz_date[:8]}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            scope,
            hashlib.sha256(canonical_request.encode()).hexdigest(),
        ]
    )
    key = ("AWS4" + secret_access_key).encode()
    for part in (amz_date[:8], region, service, "aws4_request"):
        key = hmac.new(key, part.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, string_to_sign.encode(), hashlib.sha256).hexdigest()
    return (
        f"AWS4-HMAC-SHA256 Credential={access_key_id}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )


def _error_code(response: httpx.Response) -> str:
    try:
        root = ElementTree.fromstring(response.content)
    except ElementTree.ParseError:
        return ""
    return next((el.text or "" for el in root.iter() if el.tag.rsplit("}", 1)[-1] == "Code"), "")


class S3FileStorage:
    """One private bucket on an S3-compatible service, path-style (`<endpoint>/<bucket>/<key>`).

    Objects are written without any ACL, so they stay as private as the bucket. Every request is
    signed with Signature Version 4 over the real payload hash, so the service also rejects a
    body that changed in transit.
    """

    def __init__(
        self,
        endpoint,
        bucket,
        access_key_id,
        secret_access_key,
        region="us-east-1",
        timeout=10.0,
        transport=None,
    ):
        self.endpoint = endpoint.rstrip("/")
        self.bucket = bucket
        self.region = region
        self._host = urlsplit(self.endpoint).netloc
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._client = httpx.Client(timeout=timeout, transport=transport, follow_redirects=False)

    def _request(self, operation, method, path, query="", body=b""):
        payload_sha256 = hashlib.sha256(body).hexdigest()
        headers = {
            "host": self._host,
            "x-amz-content-sha256": payload_sha256,
            "x-amz-date": datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ"),
        }
        headers["authorization"] = sign_v4(
            method,
            path,
            query,
            headers,
            payload_sha256,
            access_key_id=self._access_key_id,
            secret_access_key=self._secret_access_key,
            region=self.region,
            service="s3",
        )
        url = self.endpoint + path + ("?" + query if query else "")
        try:
            return self._client.request(method, url, headers=headers, content=body)
        except httpx.HTTPError as error:
            raise StorageError(
                f"Object storage {operation} failed: {type(error).__name__}"
            ) from None

    def _object_path(self, key):
        return f"/{self.bucket}/{_encode(checked_key(key), safe='/')}"

    @staticmethod
    def _refused(operation, response):
        return StorageError(f"Object storage {operation} failed: HTTP {response.status_code}")

    def put(self, key: str, data: bytes) -> None:
        response = self._request("put", "PUT", self._object_path(key), body=data)
        if not response.is_success:
            raise self._refused("put", response)

    def get(self, key: str) -> bytes:
        response = self._request("get", "GET", self._object_path(key))
        if response.status_code == 404 and _error_code(response) != "NoSuchBucket":
            raise FileNotFoundError("Object not found")
        if not response.is_success:
            raise self._refused("get", response)
        return response.content

    def delete(self, key: str) -> None:
        response = self._request("delete", "DELETE", self._object_path(key))
        if not (response.is_success or response.status_code == 404):
            raise self._refused("delete", response)

    def keys(self):
        """Every key in the bucket, in S3 order. Used by backup and restore (storage_backup)."""
        token = None
        while True:
            query = "list-type=2" + (f"&continuation-token={_encode(token)}" if token else "")
            response = self._request("list", "GET", f"/{self.bucket}", query)
            if not response.is_success:
                raise self._refused("list", response)
            try:
                root = ElementTree.fromstring(response.content)
            except ElementTree.ParseError:
                raise StorageError("Object storage list failed: unreadable answer") from None
            values = {}
            for element in root.iter():
                name = element.tag.rsplit("}", 1)[-1]
                if name == "Key":
                    yield element.text or ""
                elif name in ("IsTruncated", "NextContinuationToken"):
                    values[name] = element.text or ""
            token = values.get("NextContinuationToken")
            if values.get("IsTruncated") != "true" or not token:
                return


def storage_from_settings(settings) -> FileStorage:
    if settings.storage_backend == "s3":
        return S3FileStorage(
            settings.s3_endpoint_url,
            settings.s3_bucket,
            settings.s3_access_key_id,
            settings.s3_secret_access_key.get_secret_value(),
            region=settings.s3_region,
        )
    return LocalFileStorage(settings.storage_root)
