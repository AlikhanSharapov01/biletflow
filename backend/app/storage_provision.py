"""One-shot provisioning of the Docker stack's object store (#77): `python -m app.storage_provision`.

Run by the `storage-init` Compose service before api and worker start. The accounts themselves
are static identities of the `storage` service (SeaweedFS `-s3.config`, written from `.env`):
an administrator, used only here, and the app account, allowed only Read, Write and List on
S3_BUCKET. This step creates the bucket (which needs the administrator) and then proves that
the configuration took effect, failing otherwise:

1. the app credential can write, read, list and delete an object in the bucket;
2. the app credential cannot create buckets (it is not an administrator);
3. the bucket cannot be listed without credentials.

Idempotent: an existing bucket is fine. Exit status: 0 ready, 1 provisioning failed, 2 missing
settings. Messages never contain credentials.
"""

import os
import sys
import time
from uuid import uuid4

import httpx

from .storage import S3FileStorage, StorageError

# Required settings: config field -> environment variable.
ENVIRONMENT = {
    "endpoint": "S3_ENDPOINT_URL",
    "bucket": "S3_BUCKET",
    "access_key_id": "S3_ACCESS_KEY_ID",
    "secret_access_key": "S3_SECRET_ACCESS_KEY",
    "admin_access_key_id": "STORAGE_ADMIN_ACCESS_KEY_ID",
    "admin_secret_access_key": "STORAGE_ADMIN_SECRET_ACCESS_KEY",
}
ATTEMPTS, WAIT_SECONDS = 30, 2  # the store answers HTTP before its metadata service is ready
PROBE_PREFIX = ".provision-check/"


class ProvisionError(Exception):
    pass


def _store(config, bucket, key, secret, transport):
    return S3FileStorage(
        config["endpoint"],
        bucket,
        config[key],
        config[secret],
        region=config.get("region", "us-east-1"),
        transport=transport,
    )


def _create_bucket(admin, sleep):
    for attempt in range(ATTEMPTS):
        try:
            admin.create_bucket()
            return
        except StorageError as error:
            if error.status is not None and error.status < 500:
                raise ProvisionError(f"The administrator could not create the bucket: {error}")
            if attempt == ATTEMPTS - 1:
                raise ProvisionError(f"The object store is not reachable or not ready: {error}")
            sleep(WAIT_SECONDS)


def provision(config, transport=None, sleep=time.sleep):
    admin = _store(
        config, config["bucket"], "admin_access_key_id", "admin_secret_access_key", transport
    )
    app = _store(config, config["bucket"], "access_key_id", "secret_access_key", transport)
    _create_bucket(admin, sleep)

    probe, data = PROBE_PREFIX + uuid4().hex, b"biletflow storage check"
    try:
        app.put(probe, data)
        if app.get(probe) != data:
            raise ProvisionError("The app credential read back different bytes.")
        if probe not in set(app.keys()):
            raise ProvisionError("The app credential cannot list the bucket.")
        app.delete(probe)
        try:
            app.get(probe)
            raise ProvisionError("The app credential could not delete an object.")
        except FileNotFoundError:
            pass
    except StorageError as error:
        raise ProvisionError(f"The app credential cannot use the bucket: {error}") from None

    other = _store(
        config, config["bucket"] + "-scope-check", "access_key_id", "secret_access_key", transport
    )
    try:
        other.create_bucket()
    except StorageError as error:
        if error.status not in (401, 403):
            raise ProvisionError(f"Could not check the app credential's scope: {error}") from None
    else:
        raise ProvisionError(
            "The app credential can create buckets; give it only Read, Write and List on "
            "S3_BUCKET (a bucket named S3_BUCKET-scope-check was created by this check)."
        )

    with httpx.Client(transport=transport, timeout=10.0) as client:
        try:
            status = client.get(f"{admin.endpoint}/{config['bucket']}?list-type=2").status_code
        except httpx.HTTPError as error:
            raise ProvisionError(f"Could not check anonymous access: {type(error).__name__}")
    if status not in (401, 403):
        raise ProvisionError(f"The bucket answers anonymous requests (HTTP {status}).")


def main():
    missing = [name for name in ENVIRONMENT.values() if not os.environ.get(name)]
    if missing:
        print(f"Object-store provisioning needs {', '.join(missing)}.", file=sys.stderr)
        return 2
    config = {field: os.environ[name] for field, name in ENVIRONMENT.items()}
    config["region"] = os.environ.get("S3_REGION") or "us-east-1"
    try:
        provision(config)
    except ProvisionError as error:
        print(f"Object-store provisioning FAILED: {error}", file=sys.stderr)
        return 1
    print(f"Bucket {config['bucket']} is ready; the app credential is limited to it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
