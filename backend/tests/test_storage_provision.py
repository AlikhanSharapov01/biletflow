"""Object-store provisioning for the Docker stack (#77): `python -m app.storage_provision`.

`SeaweedLike` extends the in-memory FakeS3 with what provisioning depends on in SeaweedFS's
static identities: only the global admin may create buckets, the app identity is limited to
Read/Write/List on its bucket, and unsigned requests are refused once identities exist.
Provisioning must create the bucket idempotently and fail when the app credential does not work,
is broader than its bucket, or the bucket can be read anonymously.
"""

import httpx
import pytest

from app import storage_provision
from app.storage import S3FileStorage, StorageError
from tests.test_object_storage import ACCESS_KEY, BUCKET, ENDPOINT, SECRET_KEY, FakeS3, error

ADMIN_KEY = "biletflow-storage-admin"
ADMIN_SECRET = "storage-admin-secret-that-must-never-leak"
CONFIG = {
    "endpoint": ENDPOINT,
    "region": "us-east-1",
    "bucket": BUCKET,
    "access_key_id": ACCESS_KEY,
    "secret_access_key": SECRET_KEY,
    "admin_access_key_id": ADMIN_KEY,
    "admin_secret_access_key": ADMIN_SECRET,
}


class SeaweedLike(FakeS3):
    def __init__(self):
        super().__init__()
        self.bucket_exists = False
        self.created = []  # other buckets someone managed to create
        self.app_denied = False  # the app identity lacks its bucket actions
        self.app_is_admin = False  # the app identity was given global Admin
        self.anonymous_allowed = False
        self.starting = 0  # answer this many requests with 503 first

    def handle(self, request):
        authorization = request.headers.get("authorization", "")
        if self.down:
            self.requests.append(request)
            raise httpx.ConnectError("connection refused", request=request)
        if self.starting:
            self.starting -= 1
            self.requests.append(request)
            return error(503, "ServiceUnavailable")
        if not authorization:
            self.requests.append(request)
            if self.anonymous_allowed:
                return httpx.Response(200, content=b"<ListBucketResult/>")
            return error(403, "AccessDenied")
        key = authorization.split("Credential=", 1)[1].split("/", 1)[0]
        admin = key == ADMIN_KEY or (key == ACCESS_KEY and self.app_is_admin)
        path = request.url.raw_path.decode().split("?", 1)[0]
        if request.method == "PUT" and path.count("/") == 1:  # CreateBucket
            self.requests.append(request)
            if not admin:
                return error(403, "AccessDenied")
            if path[1:] != BUCKET:
                self.created.append(path[1:])
                return httpx.Response(200)
            if self.bucket_exists:
                return error(409, "BucketAlreadyExists")
            self.bucket_exists = True
            return httpx.Response(200)
        if not self.bucket_exists:
            self.requests.append(request)
            return error(404, "NoSuchBucket")
        if key == ACCESS_KEY and self.app_denied:
            self.requests.append(request)
            return error(403, "AccessDenied")
        return super().handle(request)


@pytest.fixture
def store():
    return SeaweedLike()


def run(store):
    storage_provision.provision(
        CONFIG, transport=httpx.MockTransport(store.handle), sleep=lambda seconds: None
    )


def test_creates_the_private_bucket_and_proves_the_app_credential(store):
    run(store)
    assert store.bucket_exists
    assert store.objects == {}  # the probe object is removed again
    # The bucket is made with the administrator credential.
    assert any(
        r.method == "PUT" and f"Credential={ADMIN_KEY}/" in r.headers.get("authorization", "")
        for r in store.requests
    )
    app_calls = [r for r in store.requests if ACCESS_KEY in r.headers.get("authorization", "")]
    assert {r.method for r in app_calls} >= {"PUT", "GET", "DELETE"}
    assert store.created == []


def test_is_idempotent(store):
    run(store)
    run(store)
    assert store.bucket_exists and store.objects == {}


def test_waits_for_a_starting_store(store):
    store.starting = 3
    run(store)
    assert store.bucket_exists


def test_gives_up_when_the_store_never_answers(store):
    store.down = True
    with pytest.raises(storage_provision.ProvisionError, match="not reachable"):
        run(store)


def test_fails_when_the_app_credential_cannot_use_the_bucket(store):
    store.app_denied = True
    with pytest.raises(storage_provision.ProvisionError, match="app credential"):
        run(store)


def test_fails_when_the_app_credential_is_broader_than_its_bucket(store):
    store.app_is_admin = True
    with pytest.raises(storage_provision.ProvisionError, match="create buckets"):
        run(store)


def test_fails_when_the_bucket_is_readable_anonymously(store):
    store.anonymous_allowed = True
    with pytest.raises(storage_provision.ProvisionError, match="anonymous"):
        run(store)


def test_cli_needs_every_setting(monkeypatch, capsys):
    for name in storage_provision.ENVIRONMENT.values():
        monkeypatch.delenv(name, raising=False)
    assert storage_provision.main() == 2
    assert "STORAGE_ADMIN_SECRET_ACCESS_KEY" in capsys.readouterr().err


def test_cli_reports_a_failed_provisioning(monkeypatch, capsys):
    for field, name in storage_provision.ENVIRONMENT.items():
        monkeypatch.setenv(name, CONFIG[field])

    def failing(config):
        raise storage_provision.ProvisionError("the app credential cannot use the bucket")

    monkeypatch.setattr(storage_provision, "provision", failing)
    assert storage_provision.main() == 1
    err = capsys.readouterr().err
    assert "app credential" in err
    assert SECRET_KEY not in err and ADMIN_SECRET not in err


def test_create_bucket_accepts_an_existing_bucket_and_refuses_others():
    store = SeaweedLike()
    admin = S3FileStorage(
        ENDPOINT, BUCKET, ADMIN_KEY, ADMIN_SECRET, transport=httpx.MockTransport(store.handle)
    )
    admin.create_bucket()
    admin.create_bucket()  # 409 BucketAlreadyExists
    app = S3FileStorage(
        ENDPOINT, "other", ACCESS_KEY, SECRET_KEY, transport=httpx.MockTransport(store.handle)
    )
    with pytest.raises(StorageError) as raised:
        app.create_bucket()
    assert raised.value.status == 403
