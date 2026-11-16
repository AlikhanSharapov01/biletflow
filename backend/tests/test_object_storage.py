"""S3-compatible private object storage (#77) without a live S3 service.

Signing is checked against the published AWS Signature Version 4 examples (the S3 header
examples and the generic `get-vanilla` case). The adapter runs against `FakeS3`, an in-memory
path-style S3 behind `httpx.MockTransport`, which also checks what a real service would refuse:
a missing signature or a payload hash that does not match the body.
"""

import hashlib
import io
import tarfile
from urllib.parse import parse_qs, unquote, urlsplit
from xml.sax.saxutils import escape

import httpx
import pytest
from pydantic import ValidationError

from app import storage_backup
from app.config import Settings
from app.storage import (
    LocalFileStorage,
    S3FileStorage,
    StorageError,
    sign_v4,
    storage_from_settings,
)

ENDPOINT = "http://storage:9000"
BUCKET = "biletflow-private"
ACCESS_KEY = "biletflow-app"
SECRET_KEY = "storage-secret-that-must-never-leak"
EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


class FakeS3:
    """Path-style S3 for one bucket. `down` refuses connections; `fail_with` answers every
    request with that status; `page_size` paginates ListObjectsV2."""

    def __init__(self, page_size=1000):
        self.objects, self.requests = {}, []
        self.down, self.fail_with, self.page_size = False, None, page_size

    def storage(self):
        return S3FileStorage(
            ENDPOINT,
            BUCKET,
            ACCESS_KEY,
            SECRET_KEY,
            transport=httpx.MockTransport(self.handle),
        )

    def handle(self, request):
        self.requests.append(request)
        if self.down:
            raise httpx.ConnectError("connection refused", request=request)
        if self.fail_with:
            return error(self.fail_with, "InternalError")
        if not request.headers.get("authorization", "").startswith("AWS4-HMAC-SHA256 "):
            return error(403, "AccessDenied")
        if (
            request.headers.get("x-amz-content-sha256")
            != hashlib.sha256(request.content).hexdigest()
        ):
            return error(400, "XAmzContentSHA256Mismatch")
        path = request.url.raw_path.decode().split("?", 1)[0]
        if path == f"/{BUCKET}" and request.method == "GET":
            return self.list(parse_qs(request.url.query.decode()))
        prefix = f"/{BUCKET}/"
        if not path.startswith(prefix):
            return error(404, "NoSuchBucket")
        key = unquote(path[len(prefix) :])
        if request.method == "PUT":
            self.objects[key] = request.content
            return httpx.Response(200, headers={"ETag": '"etag"'})
        if request.method == "GET":
            if key not in self.objects:
                return error(404, "NoSuchKey")
            return httpx.Response(200, content=self.objects[key])
        if request.method == "DELETE":
            self.objects.pop(key, None)
            return httpx.Response(204)
        return error(405, "MethodNotAllowed")

    def list(self, query):
        assert query["list-type"] == ["2"]
        keys = sorted(self.objects)
        start = int(query.get("continuation-token", ["0"])[0])
        page = keys[start : start + self.page_size]
        more = start + self.page_size < len(keys)
        contents = "".join(f"<Contents><Key>{escape(k)}</Key></Contents>" for k in page)
        token = f"<NextContinuationToken>{start + self.page_size}</NextContinuationToken>"
        body = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
            f"<Name>{BUCKET}</Name><IsTruncated>{'true' if more else 'false'}</IsTruncated>"
            f"{contents}{token if more else ''}</ListBucketResult>"
        )
        return httpx.Response(200, content=body.encode())


def error(status, code):
    body = f"<Error><Code>{code}</Code><Message>refused</Message></Error>"
    return httpx.Response(status, content=body.encode())


@pytest.fixture
def s3():
    return FakeS3()


# --- Signature Version 4 against AWS's published examples -------------------------------------

AWS_EXAMPLE = {
    "access_key_id": "AKIAIOSFODNN7EXAMPLE",
    "secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "region": "us-east-1",
    "service": "s3",
}


def test_sigv4_s3_get_object_example():
    headers = {
        "host": "examplebucket.s3.amazonaws.com",
        "range": "bytes=0-9",
        "x-amz-content-sha256": EMPTY_SHA256,
        "x-amz-date": "20130524T000000Z",
    }
    assert sign_v4("GET", "/test.txt", "", headers, EMPTY_SHA256, **AWS_EXAMPLE) == (
        "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, "
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, "
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
    )


def test_sigv4_s3_put_object_example_encodes_the_path():
    payload = "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072"
    assert hashlib.sha256(b"Welcome to Amazon S3.").hexdigest() == payload
    headers = {
        "date": "Fri, 24 May 2013 00:00:00 GMT",
        "host": "examplebucket.s3.amazonaws.com",
        "x-amz-date": "20130524T000000Z",
        "x-amz-storage-class": "REDUCED_REDUNDANCY",
        "x-amz-content-sha256": payload,
    }
    assert sign_v4("PUT", "/test%24file.text", "", headers, payload, **AWS_EXAMPLE) == (
        "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, "
        "SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class, "
        "Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd"
    )


def test_sigv4_s3_list_objects_example_sorts_the_query():
    headers = {
        "host": "examplebucket.s3.amazonaws.com",
        "x-amz-content-sha256": EMPTY_SHA256,
        "x-amz-date": "20130524T000000Z",
    }
    # Sent in the other order: the canonical query string is sorted.
    assert sign_v4("GET", "/", "prefix=J&max-keys=2", headers, EMPTY_SHA256, **AWS_EXAMPLE) == (
        "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, "
        "SignedHeaders=host;x-amz-content-sha256;x-amz-date, "
        "Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7"
    )


def test_sigv4_generic_get_vanilla_example():
    headers = {"host": "example.amazonaws.com", "x-amz-date": "20150830T123600Z"}
    assert sign_v4(
        "GET",
        "/",
        "",
        headers,
        EMPTY_SHA256,
        access_key_id="AKIDEXAMPLE",
        secret_access_key="wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
        region="us-east-1",
        service="service",
    ) == (
        "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, "
        "SignedHeaders=host;x-amz-date, "
        "Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31"
    )


# --- Adapter ------------------------------------------------------------------------------------


def test_put_get_delete_round_trip_signs_what_it_sends(s3):
    storage = s3.storage()
    storage.put("support/case/file", b"attachment bytes")
    assert s3.objects == {"support/case/file": b"attachment bytes"}
    assert storage.get("support/case/file") == b"attachment bytes"
    storage.delete("support/case/file")
    storage.delete("support/case/file")  # idempotent
    assert s3.objects == {}
    with pytest.raises(FileNotFoundError):
        storage.get("support/case/file")

    put = s3.requests[0]
    assert put.method == "PUT"
    assert str(put.url) == f"{ENDPOINT}/{BUCKET}/support/case/file"
    assert put.headers["host"] == "storage:9000"
    assert put.headers["x-amz-content-sha256"] == hashlib.sha256(b"attachment bytes").hexdigest()
    # Private: no ACL or anything else that could make the object public.
    assert not [name for name in put.headers if name.startswith("x-amz-acl")]
    authorization = put.headers["authorization"]
    date = put.headers["x-amz-date"]
    assert authorization.startswith(
        f"AWS4-HMAC-SHA256 Credential={ACCESS_KEY}/{date[:8]}/us-east-1/s3/aws4_request, "
        "SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature="
    )
    # The signature covers the path, host and hashes this request actually carries.
    signed = {name: put.headers[name] for name in ("host", "x-amz-content-sha256", "x-amz-date")}
    assert authorization == sign_v4(
        "PUT",
        put.url.raw_path.decode(),
        "",
        signed,
        signed["x-amz-content-sha256"],
        access_key_id=ACCESS_KEY,
        secret_access_key=SECRET_KEY,
        region="us-east-1",
        service="s3",
    )
    assert SECRET_KEY not in str(put.headers)


def test_keys_are_percent_encoded_once():
    s3 = FakeS3()
    storage = s3.storage()
    storage.put("events/e/a b+c.png", b"x")
    assert s3.requests[0].url.raw_path == f"/{BUCKET}/events/e/a%20b%2Bc.png".encode()
    assert s3.objects == {"events/e/a b+c.png": b"x"}


def test_invalid_keys_are_refused_before_any_request(s3):
    storage = s3.storage()
    for key in ("../x", "a/../x", "/abs", "a//b", "", "a/./b", "a\\b", "a/", "a\0b"):
        for call in (lambda k: storage.put(k, b"x"), storage.get, storage.delete):
            with pytest.raises(ValueError):
                call(key)
    assert s3.requests == []


@pytest.mark.parametrize("status", [403, 500, 503])
def test_refused_requests_raise_storage_errors(s3, status):
    storage = s3.storage()
    s3.fail_with = status
    for call in (lambda: storage.put("a/b", b"x"), lambda: storage.get("a/b")):
        with pytest.raises(StorageError) as raised:
            call()
        # An OSError, so callers answer 503 storage_unavailable; never "file not found".
        assert isinstance(raised.value, OSError)
        assert not isinstance(raised.value, FileNotFoundError)
    with pytest.raises(StorageError):
        storage.delete("a/b")


def test_missing_bucket_is_not_a_missing_object(s3):
    storage = S3FileStorage(
        ENDPOINT, "other-bucket", ACCESS_KEY, SECRET_KEY, transport=httpx.MockTransport(s3.handle)
    )
    with pytest.raises(StorageError) as raised:
        storage.get("a/b")
    assert not isinstance(raised.value, FileNotFoundError)
    with pytest.raises(StorageError):
        storage.delete("a/b")  # not "already deleted": the bucket itself is missing


def test_unreachable_store_raises_without_echoing_keys_or_credentials(s3):
    storage = s3.storage()
    s3.down = True
    for call in (
        lambda: storage.put("support/secret-key-name", b"x"),
        lambda: storage.get("support/secret-key-name"),
        lambda: storage.delete("support/secret-key-name"),
    ):
        with pytest.raises(StorageError) as raised:
            call()
        message = str(raised.value)
        assert "secret-key-name" not in message and SECRET_KEY not in message
        assert ENDPOINT not in message
        assert raised.value.__cause__ is None and raised.value.__suppress_context__


def test_keys_follow_list_pagination():
    s3 = FakeS3(page_size=2)
    storage = s3.storage()
    for key in ("a/1", "a/2", "b/3", "c&d/4", "e/5"):
        s3.objects[key] = b"x"
    assert list(storage.keys()) == ["a/1", "a/2", "b/3", "c&d/4", "e/5"]
    lists = [r for r in s3.requests if r.url.raw_path.decode().startswith(f"/{BUCKET}?")]
    assert len(lists) == 3
    assert parse_qs(urlsplit(str(lists[1].url)).query)["continuation-token"] == ["2"]


# --- Configuration ------------------------------------------------------------------------------


def settings_with(**values):
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://u:p@localhost/biletflow_test",
        jwt_secret="j" * 48,
        challenge_secret="c" * 48,
        **values,
    )


def test_local_storage_is_the_default(tmp_path):
    storage = storage_from_settings(settings_with(storage_root=str(tmp_path)))
    assert isinstance(storage, LocalFileStorage)


def test_s3_backend_is_selected_by_configuration():
    storage = storage_from_settings(
        settings_with(
            storage_backend="s3",
            s3_endpoint_url=ENDPOINT + "/",
            s3_bucket=BUCKET,
            s3_access_key_id=ACCESS_KEY,
            s3_secret_access_key=SECRET_KEY,
        )
    )
    assert isinstance(storage, S3FileStorage)
    assert storage.bucket == BUCKET and storage.endpoint == ENDPOINT


@pytest.mark.parametrize(
    "missing",
    [
        {"s3_endpoint_url": ""},
        {"s3_endpoint_url": "storage:9000"},
        {"s3_bucket": ""},
        {"s3_bucket": "Not_A_Bucket"},
        {"s3_access_key_id": ""},
        {"s3_secret_access_key": ""},
    ],
)
def test_s3_backend_refuses_incomplete_configuration(missing):
    values = {
        "storage_backend": "s3",
        "s3_endpoint_url": ENDPOINT,
        "s3_bucket": BUCKET,
        "s3_access_key_id": ACCESS_KEY,
        "s3_secret_access_key": SECRET_KEY,
        **missing,
    }
    with pytest.raises(ValidationError):
        settings_with(**values)


# --- Object-store backup and restore (tools/backup.sh, tools/restore.sh) -----------------------


def archive_of(files):
    """files.tar.gz as `tar -czf - -C <storage> .` wrote it before #77, with a temporary
    upload file LocalFileStorage may leave behind."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for name in ("./", "./events/", "./events/e/"):
            info = tarfile.TarInfo(name.rstrip("/") or ".")
            info.type = tarfile.DIRTYPE
            tar.addfile(info)
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    buffer.seek(0)
    return buffer


def members(data):
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        return {m.name: tar.extractfile(m).read() for m in tar.getmembers() if m.isfile()}


def test_export_archives_every_object_under_its_key():
    s3 = FakeS3(page_size=1)
    s3.objects = {"events/e/a.png": b"png", "tickets/t/f.pdf": b"%PDF", "support/c/f": b"att"}
    out = io.BytesIO()
    assert storage_backup.export(s3.storage(), out) == 3
    assert members(out.getvalue()) == s3.objects


def test_export_skips_an_object_deleted_while_listing(s3, monkeypatch):
    storage = s3.storage()
    s3.objects = {"a/1": b"one", "a/2": b"two"}
    real_get = storage.get

    def deleted_meanwhile(key):
        if key == "a/1":
            raise FileNotFoundError(key)
        return real_get(key)

    monkeypatch.setattr(storage, "get", deleted_meanwhile)
    out = io.BytesIO()
    assert storage_backup.export(storage, out) == 1
    assert members(out.getvalue()) == {"a/2": b"two"}


def test_restore_replaces_the_bucket_with_the_archive(s3):
    s3.objects = {"events/e/a.png": b"changed", "events/e/new.png": b"after the backup"}
    archive = archive_of(
        {
            "./events/e/a.png": b"png",
            "./tickets/t/f.pdf": b"%PDF",
            "./events/e/.upload-x1y2": b"partial",
            "./drill-marker.txt": b"restored-ok\n",
        }
    )
    assert storage_backup.restore(s3.storage(), archive) == (3, 1)
    assert s3.objects == {
        "events/e/a.png": b"png",
        "tickets/t/f.pdf": b"%PDF",
        "drill-marker.txt": b"restored-ok\n",
    }


def test_restore_round_trips_an_export():
    source, target = FakeS3(), FakeS3()
    source.objects = {"events/e/a.png": b"png", "support/c/f": b"att"}
    out = io.BytesIO()
    storage_backup.export(source.storage(), out)
    out.seek(0)
    assert storage_backup.restore(target.storage(), out) == (2, 0)
    assert target.objects == source.objects


def test_restore_refuses_unsafe_names_before_deleting_anything(s3):
    s3.objects = {"events/e/a.png": b"png"}
    with pytest.raises(ValueError):
        storage_backup.restore(s3.storage(), archive_of({"../outside": b"x"}))
    assert s3.objects == {"events/e/a.png": b"png"}


def test_cli_reports_storage_failures_without_a_traceback(s3, monkeypatch, capsys):
    s3.down = True
    monkeypatch.setattr(storage_backup, "configured_storage", s3.storage)
    assert storage_backup.main(["export"]) == 1
    assert "StorageError" in capsys.readouterr().err


def test_cli_requires_the_s3_backend(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(
        storage_backup,
        "configured_storage",
        lambda: LocalFileStorage(tmp_path),
    )
    assert storage_backup.main(["export"]) == 2
    assert "STORAGE_BACKEND=s3" in capsys.readouterr().err
