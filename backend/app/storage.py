"""Private object storage behind a small interface.

Keys are `/`-separated relative paths such as `support/<case_id>/<file_id>`. Nothing here is
served publicly; callers decide who may read an object and hand out only short-lived signed
links (see attachment_service). `storage_from_settings` is the extension point: an S3 or other
object-store backend implements `FileStorage` and is selected there. Only the local filesystem
backend exists today.
"""

import contextlib
import os
import tempfile
from pathlib import Path
from typing import Protocol


class FileStorage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...

    def get(self, key: str) -> bytes:
        """Raise FileNotFoundError when the object does not exist."""
        ...

    def delete(self, key: str) -> None:
        """Idempotent: deleting a missing object is not an error."""
        ...


class LocalFileStorage:
    def __init__(self, root):
        self.root = Path(root).resolve()

    def path(self, key: str) -> Path:
        parts = key.split("/")
        if (
            not key
            or key.startswith("/")
            or any(part in ("", ".", "..") for part in parts)
            or "\\" in key
            or "\0" in key
        ):
            raise ValueError("Invalid storage key")
        return self.root.joinpath(*parts)

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


def storage_from_settings(settings) -> FileStorage:
    return LocalFileStorage(settings.storage_root)
