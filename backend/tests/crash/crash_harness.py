"""Parent-side helpers for the crash-recovery harness: an SMTP sink and child-process control."""

import email
import email.policy
import json
import os
import signal
import socket
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path

import httpx

RUNNER = Path(__file__).with_name("crash_runner.py")
KILLED = 137  # os._exit(137) at a kill point, the same code a SIGKILLed container reports


class SmtpSink:
    """Minimal local SMTP server that keeps every accepted message (no relay, no auth).

    A message is recorded when the final "." of DATA arrives, before "250" is returned: from the
    sender's point of view it is accepted exactly when it is recorded here.
    """

    def __init__(self):
        self.messages = []
        self.lock = threading.Lock()
        sink = self

        class Handler(socketserver.StreamRequestHandler):
            def reply(self, line):
                self.wfile.write(line.encode() + b"\r\n")
                self.wfile.flush()

            def handle(self):
                self.reply("220 crash-sink ESMTP")
                while True:
                    raw = self.rfile.readline()
                    if not raw:
                        return
                    command = raw.decode(errors="replace").strip()
                    verb = command[:4].upper()
                    if verb == "EHLO":
                        self.reply("250-crash-sink")
                        self.reply("250 8BITMIME")
                    elif verb in ("HELO", "MAIL", "RCPT", "RSET", "NOOP"):
                        self.reply("250 OK")
                    elif verb == "DATA":
                        self.reply("354 End data with <CR><LF>.<CR><LF>")
                        lines = []
                        while True:
                            line = self.rfile.readline()
                            if not line:
                                return  # sender vanished mid-DATA: nothing was accepted
                            if line in (b".\r\n", b".\n"):
                                break
                            lines.append(line[1:] if line.startswith(b"..") else line)
                        message = email.message_from_bytes(
                            b"".join(lines), policy=email.policy.default
                        )
                        with sink.lock:
                            sink.messages.append(message)
                        self.reply("250 OK: queued")
                    elif verb == "QUIT":
                        self.reply("221 Bye")
                        return
                    else:
                        self.reply("502 Command not implemented")

        socketserver.ThreadingTCPServer.allow_reuse_address = True
        self.server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def with_id(self, message_id):
        with self.lock:
            return [m for m in self.messages if m["Message-ID"] == message_id]

    def close(self):
        self.server.shutdown()
        self.server.server_close()


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def wait_until(predicate, timeout=60, interval=0.2, message="condition"):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(interval)
    raise AssertionError(f"timed out after {timeout}s waiting for {message}")


class Child:
    def __init__(self, role, process, root, name, marker_dir):
        self.role, self.process, self.root, self.name = role, process, root, name
        self.marker_dir = marker_dir

    @property
    def pid(self):
        return self.process.pid

    def log(self):
        path = self.root / f"{self.name}.log"
        return path.read_text(errors="replace")[-4000:] if path.exists() else ""

    def wait_exit(self, timeout=60):
        try:
            return self.process.wait(timeout)
        except subprocess.TimeoutExpired:
            raise AssertionError(
                f"{self.name} did not reach its kill point; log:\n{self.log()}"
            ) from None

    def marker(self, point, timeout=60):
        path = self.marker_dir / f"{point}.json"
        wait_until(path.exists, timeout, message=f"{self.name} kill point {point}")
        # The marker is written before the child dies or stops; read it after it settles.
        return json.loads(wait_until(lambda: path.read_text() or None, 5, message="marker"))

    def stopped(self):
        """True once the child has stopped itself with SIGSTOP (macOS/Linux `ps` state T)."""
        state = subprocess.run(
            ["ps", "-o", "stat=", "-p", str(self.pid)], capture_output=True, text=True
        ).stdout.strip()
        return state.startswith("T")

    def signal(self, number):
        if self.process.poll() is None:
            os.kill(self.pid, number)

    def stop(self, timeout=15):
        """Graceful stop for a surviving worker/API: SIGINT, then SIGKILL as a last resort."""
        if self.process.poll() is not None:
            return self.process.returncode
        os.kill(self.pid, signal.SIGCONT)
        os.kill(self.pid, signal.SIGINT)
        try:
            return self.process.wait(timeout)
        except subprocess.TimeoutExpired:
            self.process.kill()
            return self.process.wait(timeout)


class Harness:
    """Starts real worker/API child processes against the disposable test database."""

    def __init__(self, root, database_url, storage_root, smtp_port):
        self.root, self.children, self.count = Path(root), [], 0
        self.database_url, self.storage_root, self.smtp_port = (
            database_url,
            storage_root,
            smtp_port,
        )
        self.root.mkdir(parents=True, exist_ok=True)

    def spawn(self, role, kill=None, port=None):
        self.count += 1
        name = f"{self.count:02d}-{role}" + (f"-{kill['point']}" if kill else "")
        marker_dir = self.root / name
        marker_dir.mkdir()
        config = {
            "database_url": self.database_url,
            "storage_root": self.storage_root,
            "smtp_port": self.smtp_port,
            "marker_dir": str(marker_dir),
            "kill": kill,
            "port": port,
        }
        config_path = self.root / f"{name}.json"
        config_path.write_text(json.dumps(config))
        log = open(self.root / f"{name}.log", "wb")
        # cwd is the scenario directory, so no developer backend/.env is ever read.
        process = subprocess.Popen(
            [sys.executable, str(RUNNER), role, str(config_path)],
            cwd=marker_dir,
            stdout=log,
            stderr=subprocess.STDOUT,
            env={k: v for k, v in os.environ.items() if k not in ("DATABASE_URL",)},
        )
        log.close()
        child = Child(role, process, self.root, name, marker_dir)
        self.children.append(child)
        return child

    def worker(self, kill=None):
        return self.spawn("worker", kill)

    def api(self, kill=None):
        port = free_port()
        child = self.spawn("api", kill, port)
        child.url = f"http://127.0.0.1:{port}"

        def ready():
            if child.process.poll() is not None:
                raise AssertionError(f"API exited during startup:\n{child.log()}")
            try:
                return httpx.get(child.url + "/health/ready", timeout=1).status_code == 200
            except httpx.TransportError:
                return False

        wait_until(ready, 60, message="API readiness")
        return child

    def cleanup(self):
        for child in self.children:
            if child.process.poll() is None:
                child.process.kill()  # SIGKILL also ends a SIGSTOPped child
                child.process.wait(10)
