"""Checkout and admission load harness with optional concurrent organizer analytics (#80).

Run from ``backend/`` against a disposable PostgreSQL database whose name ends in ``_test``::

    LOAD_DATABASE_URL=postgresql+psycopg://user@127.0.0.1:5432/biletflow_load_test \\
        uv run python -m tests.load.load_harness --runs 3 --output-dir /tmp/biletflow-load

The harness migrates the database, then starts the real API (``uvicorn app.main:create_app
--factory``, one process, as in ``backend/Dockerfile``) and the real worker (``python -m
app.worker``) as separate processes, plus a local SMTP sink so the worker can deliver mail.
Every record is created through the public ``/api/v1`` API; the database is only read to pick
up e-mail verification and staff invitation tokens (which normally arrive by e-mail) and to
check invariants after each run.

Scenarios (each run uses fresh events, so runs are independent):

* ``A`` baseline: ``--buyers`` concurrent paid checkouts (hold -> checkout -> simulated
  payment -> order read) against ``--capacity`` tickets, while ``--scanners`` scanner clients
  each check in their own tickets plus deliberate duplicates of another scanner's tickets.
* ``B`` the same, while ``--analytics-clients`` organizer clients loop on the analytics
  summary and sales-series endpoints for the busy events and a larger historical event.

Test-environment-only server settings: per-address and per-account rate limits are raised to
1,000,000 per window, because every simulated client shares 127.0.0.1. The limiter itself
still runs (one extra committed transaction per limited request), so its cost is measured.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import platform
import random
import secrets
import shutil
import socket
import statistics
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

BACKEND = Path(__file__).resolve().parents[2]
PASSWORD = "correct horse battery staple"
ADMISSION_TARGET_SECONDS = 2.0
RATE_LIMIT_FOR_LOAD = 1_000_000
SOLD_OUT_CODES = {"event_capacity_exceeded", "ticket_capacity_exceeded"}


class SetupError(RuntimeError):
    pass


# --------------------------------------------------------------------------- measurement


@dataclass
class Sample:
    op: str
    status: int
    code: str | None
    seconds: float
    started: float


@dataclass
class Recorder:
    samples: list[Sample] = field(default_factory=list)

    async def call(self, client, op, method, url, **kwargs):
        started = time.perf_counter()
        try:
            response = await client.request(method, url, **kwargs)
        except httpx.HTTPError as error:
            self.samples.append(
                Sample(op, 0, type(error).__name__, time.perf_counter() - started, started)
            )
            return None
        seconds = time.perf_counter() - started
        self.samples.append(
            Sample(op, response.status_code, error_code(response), seconds, started)
        )
        return response

    def add(self, op, status, code, seconds, started):
        self.samples.append(Sample(op, status, code, seconds, started))


def error_code(response):
    if response.status_code < 400:
        return None
    try:
        detail = response.json().get("detail")
    except (ValueError, AttributeError):
        return None
    if isinstance(detail, dict):
        return detail.get("code")
    return None


def percentile(values, p):
    """Nearest-rank percentile of an already sorted list."""
    if not values:
        return None
    rank = max(1, math.ceil(p / 100 * len(values)))
    return values[rank - 1]


def summarize(samples, window):
    by_op = defaultdict(list)
    for sample in samples:
        by_op[sample.op].append(sample)
    result = {}
    for op, items in sorted(by_op.items()):
        times = sorted(s.seconds for s in items)
        outcomes = Counter(f"{s.status}" + (f" {s.code}" if s.code else "") for s in items)
        result[op] = {
            "count": len(items),
            "ok": sum(1 for s in items if 200 <= s.status < 300),
            "server_errors": sum(1 for s in items if s.status >= 500),
            "transport_errors": sum(1 for s in items if s.status == 0),
            "outcomes": dict(sorted(outcomes.items())),
            "p50_ms": ms(percentile(times, 50)),
            "p95_ms": ms(percentile(times, 95)),
            "p99_ms": ms(percentile(times, 99)),
            "max_ms": ms(times[-1]),
            "mean_ms": ms(statistics.fmean(times)),
            "throughput_rps": round(len(items) / window, 2) if window > 0 else None,
        }
    return result


def ms(seconds):
    return None if seconds is None else round(seconds * 1000, 1)


# --------------------------------------------------------------------------- local SMTP sink


class SmtpSink:
    """Accepts and discards mail so the worker's delivery path runs as it would with Mailpit."""

    def __init__(self):
        self.messages = 0
        self.port = free_port()
        self.loop = asyncio.new_event_loop()
        self.ready = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self.thread.start()
        self.ready.wait(10)

    def stop(self):
        self.loop.call_soon_threadsafe(self.loop.stop)

    def _run(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(asyncio.start_server(self._handle, "127.0.0.1", self.port))
        self.ready.set()
        self.loop.run_forever()

    async def _handle(self, reader, writer):
        reply = writer.write
        reply(b"220 biletflow-load-sink\r\n")
        in_data = False
        try:
            while line := await reader.readline():
                if in_data:
                    if line.rstrip(b"\r\n") == b".":
                        in_data = False
                        self.messages += 1
                        reply(b"250 OK\r\n")
                        await writer.drain()
                    continue
                verb = line[:4].upper()
                if verb == b"EHLO":
                    reply(b"250-biletflow-load-sink\r\n250 8BITMIME\r\n")
                elif verb == b"DATA":
                    in_data = True
                    reply(b"354 End data with <CR><LF>.<CR><LF>\r\n")
                elif verb == b"QUIT":
                    reply(b"221 Bye\r\n")
                    await writer.drain()
                    break
                else:
                    reply(b"250 OK\r\n")
                await writer.drain()
        finally:
            writer.close()


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


# --------------------------------------------------------------------------- processes


@dataclass
class Stack:
    database_url: str
    output: Path
    jwt_secret: str = field(default_factory=lambda: secrets.token_urlsafe(48))
    challenge_secret: str = field(default_factory=lambda: secrets.token_urlsafe(48))
    port: int = field(default_factory=free_port)
    processes: list = field(default_factory=list)
    logs: list = field(default_factory=list)

    @property
    def base_url(self):
        return f"http://127.0.0.1:{self.port}"

    def env(self, smtp_port, storage):
        env = {k: v for k, v in os.environ.items() if not k.startswith(("PYTHON", "VIRTUAL"))}
        env.update(
            PYTHONPATH=str(BACKEND),
            PYTHONUNBUFFERED="1",
            DATABASE_URL=self.database_url,
            JWT_SECRET=self.jwt_secret,
            CHALLENGE_SECRET=self.challenge_secret,
            ENVIRONMENT="test",
            COOKIE_SECURE="false",
            ALLOWED_ORIGINS=json.dumps([self.base_url]),
            RATE_IP_LIMIT=str(RATE_LIMIT_FOR_LOAD),
            RATE_IDENTITY_LIMIT=str(RATE_LIMIT_FOR_LOAD),
            ACCESS_MINUTES="30",
            ADMISSION_REQUIRE_ENTRY_CONFIRMATION="true",
            ENTRY_CONFIRMATION_SECONDS="120",
            SMTP_HOST="127.0.0.1",
            SMTP_PORT=str(smtp_port),
            STORAGE_ROOT=str(storage),
        )
        return env

    def migrate(self):
        env = self.env(1025, self.output / "storage")
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND,
            env=env,
            check=True,
            capture_output=True,
        )

    def start(self, smtp_port):
        storage = self.output / "storage"
        storage.mkdir(parents=True, exist_ok=True)
        env = self.env(smtp_port, storage)
        # Run outside backend/ so a developer's backend/.env cannot change the measured settings.
        workdir = self.output / "run"
        workdir.mkdir(parents=True, exist_ok=True)
        commands = {
            "api": [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:create_app",
                "--factory",
                "--host",
                "127.0.0.1",
                "--port",
                str(self.port),
                "--no-access-log",
            ],
            "worker": [sys.executable, "-m", "app.worker"],
        }
        for name, command in commands.items():
            log = open(self.output / f"{name}.log", "wb")  # noqa: SIM115 - closed in stop()
            self.logs.append(log)
            self.processes.append(
                subprocess.Popen(command, cwd=workdir, env=env, stdout=log, stderr=log)
            )
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            for process in self.processes:
                if process.poll() is not None:
                    raise SetupError(f"{process.args[2]} exited early; see {self.output}")
            try:
                if httpx.get(self.base_url + "/health/ready", timeout=2).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(0.3)
        raise SetupError("API did not become ready within 60 seconds")

    def stop(self):
        for process in self.processes:
            process.terminate()
        for process in self.processes:
            try:
                process.wait(10)
            except subprocess.TimeoutExpired:
                process.kill()
        for log in self.logs:
            log.close()


# --------------------------------------------------------------------------- API helpers


def iso(moment):
    return moment.isoformat()


def expect(response, status, label):
    if response.status_code != status:
        raise SetupError(f"{label}: expected {status}, got {response.status_code} {response.text}")
    return response.json()


def bearer(token):
    return {"Authorization": "Bearer " + token}


@dataclass
class Account:
    email: str
    kind: str
    headers: dict = field(default_factory=dict)


class Harness:
    def __init__(self, args, stack):
        self.args = args
        self.stack = stack
        engine = create_engine(stack.database_url, pool_size=2)
        self.engine = engine
        self.sessions = sessionmaker(engine)
        self.settings = None
        self.client = None
        self.run_tag = uuid.uuid4().hex[:8]
        self.gate = asyncio.Semaphore(args.setup_concurrency)
        self.accounts = {}
        self.members = {}
        self.history = None

    # ----------------------------------------------------------------- tokens from the DB

    def _verification_token(self, email):
        from app.models import AccountToken, User
        from app.security import challenge_value

        with self.sessions() as db:
            token = db.scalar(
                select(AccountToken)
                .join(User)
                .where(User.email == email, AccountToken.purpose == "email_verify")
                .order_by(AccountToken.created_at.desc())
                .limit(1)
            )
            return challenge_value(self.settings, "email_verify", token.id)

    def _invite_token(self, invitation_id):
        from app.security import challenge_value

        return challenge_value(self.settings, "staff_invite", invitation_id)

    # ----------------------------------------------------------------- setup steps

    async def register(self, name, kind):
        email = f"load-{name}-{self.run_tag}@example.com"
        async with self.gate:
            r = await self.client.post(
                "/api/v1/auth/register",
                json={"email": email, "password": PASSWORD, "display_name": name.title()},
            )
            expect(r, 202, f"register {name}")
            token = await asyncio.to_thread(self._verification_token, email)
            r = await self.client.post("/api/v1/auth/verify-email", json={"token": token})
            expect(r, 200, f"verify {name}")
        self.accounts[name] = Account(email, kind)

    async def login(self, name):
        account = self.accounts[name]
        async with self.gate:
            r = await self.client.post(
                "/api/v1/auth/login",
                json={"email": account.email, "password": PASSWORD, "client_kind": account.kind},
            )
            account.headers = bearer(expect(r, 200, f"login {name}")["access_token"])

    async def login_all(self):
        await asyncio.gather(*(self.login(name) for name in self.accounts))
        self.client.cookies.clear()

    def names(self, prefix):
        return sorted(
            (n for n in self.accounts if n.startswith(prefix + "-")),
            key=lambda n: int(n.rsplit("-", 1)[1]),
        )

    def headers(self, name):
        return self.accounts[name].headers

    async def setup_global(self):
        from app.config import Settings

        self.settings = Settings(
            _env_file=None,
            database_url=self.stack.database_url,
            jwt_secret=self.stack.jwt_secret,
            challenge_secret=self.stack.challenge_secret,
        )
        a = self.args
        roles = [("owner", "web")]
        roles += [(f"scanner-{i}", "scanner") for i in range(a.scanners)]
        roles += [(f"buyer-{i}", "web") for i in range(a.buyers)]
        roles += [(f"attendee-{i}", "web") for i in range(a.attendees)]
        await asyncio.gather(*(self.register(name, kind) for name, kind in roles))
        await self.login_all()
        owner = self.headers("owner")
        r = await self.client.post(
            "/api/v1/organizations",
            headers=owner,
            json={"name": "Load Test Organizer", "contact_email": "organizer@example.com"},
        )
        self.org = expect(r, 201, "organization")
        for part in ("payout-profile", "identity-verification"):
            r = await self.client.post(
                f"/api/v1/organizations/{self.org['id']}/paid-sales/{part}", headers=owner
            )
            expect(r, 200, part)
        self.category = (await self.client.get("/api/v1/categories")).json()[0]["id"]
        self.venue = (await self.client.get("/api/v1/venues")).json()[0]["id"]
        for name in self.names("scanner"):
            r = await self.client.post(
                f"/api/v1/organizations/{self.org['id']}/invitations",
                headers=owner,
                json={"email": self.accounts[name].email},
            )
            token = self._invite_token(expect(r, 201, "invite")["id"])
            r = await self.client.post(
                "/api/v1/staff-invitations/accept",
                headers=self.headers(name),
                json={"token": token},
            )
            self.members[name] = expect(r, 200, "accept invitation")["id"]
        if a.history_tickets:
            self.history = await self.build_history()

    async def create_event(self, title, capacity, kind, per_order_limit, price_minor=0):
        owner = self.headers("owner")
        t = datetime.now(UTC)
        r = await self.client.post(
            f"/api/v1/organizations/{self.org['id']}/events",
            headers=owner,
            json={
                "category_id": self.category,
                "venue_id": self.venue,
                "title": title,
                "capacity": capacity,
                "starts_at": iso(t + timedelta(hours=1)),
                "ends_at": iso(t + timedelta(hours=4)),
                "registration_opens_at": iso(t - timedelta(hours=1)),
                "registration_closes_at": iso(t + timedelta(hours=1)),
                "admission_opens_at": iso(t - timedelta(minutes=10)),
                "admission_closes_at": iso(t + timedelta(hours=3)),
                "refund_cutoff_at": iso(t + timedelta(minutes=30)),
            },
        )
        event = expect(r, 201, f"event {title}")
        r = await self.client.post(
            f"/api/v1/events/{event['id']}/ticket-types",
            headers=owner,
            json={
                "name": "Standard",
                "kind": kind,
                "price_minor": price_minor,
                "quantity_limit": capacity,
                "per_order_limit": per_order_limit,
                "sales_open_at": iso(t - timedelta(hours=1)),
                "sales_close_at": iso(t + timedelta(hours=1)),
            },
        )
        ticket_type = expect(r, 201, "ticket type")
        r = await self.client.post(f"/api/v1/events/{event['id']}/publish", headers=owner)
        expect(r, 200, "publish")
        if kind == "paid":
            await self.activate_paid_sales(event["id"])
        return event, ticket_type

    async def activate_paid_sales(self, event_id):
        owner = self.headers("owner")
        checklist = (
            await self.client.get(f"/api/v1/events/{event_id}/paid-sales", headers=owner)
        ).json()
        r = await self.client.post(
            f"/api/v1/events/{event_id}/paid-sales/terms",
            headers=owner,
            json={"terms_version": checklist["terms"]["version"]},
        )
        expect(r, 200, "terms")
        r = await self.client.post(
            f"/api/v1/events/{event_id}/paid-sales/activation", headers=owner
        )
        fee = expect(r, 200, "activation")
        for _ in range(120):
            state = (
                await self.client.get(f"/api/v1/events/{event_id}/paid-sales", headers=owner)
            ).json()
            if state["payment"]["status"] == "pending":
                break
            await asyncio.sleep(0.25)
        else:
            raise SetupError("worker did not initialize the activation fee payment")
        r = await self.client.post(
            f"/api/v1/simulator/payments/{fee['payment']['id']}/events",
            headers=owner,
            json={"outcome": "succeeded"},
        )
        expect(r, 200, "activation fee payment")
        state = (
            await self.client.get(f"/api/v1/events/{event_id}/paid-sales", headers=owner)
        ).json()
        if state["status"] != "active":
            raise SetupError(f"paid sales not active: {state['status']}")

    async def buy(self, buyer, event_id, ticket_type_id, quantity, paid, promo=None):
        headers = self.headers(buyer)
        body = {"items": [{"ticket_type_id": ticket_type_id, "quantity": quantity}]}
        if promo:
            body["promo_code"] = promo
        async with self.gate:
            hold = expect(
                await self.client.post(
                    f"/api/v1/events/{event_id}/holds", headers=headers, json=body
                ),
                201,
                "setup hold",
            )
            recipients = {
                "recipients": [
                    {
                        "allocation_id": a["id"],
                        "name": buyer.title(),
                        "email": self.accounts[buyer].email,
                    }
                    for a in hold["allocations"]
                ]
            }
            path = "checkout" if paid else "confirm"
            order = expect(
                await self.client.post(
                    f"/api/v1/holds/{hold['id']}/{path}", headers=headers, json=recipients
                ),
                200,
                f"setup {path}",
            )
            if paid:
                r = await self.client.post(
                    f"/api/v1/simulator/payments/{order['payment']['id']}/events",
                    headers=headers,
                    json={"outcome": "succeeded"},
                )
                expect(r, 200, "setup payment")
                order = expect(
                    await self.client.get(f"/api/v1/orders/{order['id']}", headers=headers),
                    200,
                    "setup order",
                )
            if order["status"] != "confirmed":
                raise SetupError(f"setup order not confirmed: {order['status']}")
            return order

    async def build_history(self):
        """A larger sold paid event with a campaign, so analytics has more rows to aggregate."""
        a = self.args
        per_order = 4
        event, ticket_type = await self.create_event(
            "Load history event", a.history_tickets, "paid", per_order, price_minor=400000
        )
        t = datetime.now(UTC)
        r = await self.client.post(
            f"/api/v1/events/{event['id']}/campaigns",
            headers=self.headers("owner"),
            json={
                "name": "Load 10%",
                "discount_kind": "percent",
                "value": 10,
                "starts_at": iso(t - timedelta(hours=1)),
                "ends_at": iso(t + timedelta(hours=1)),
                "max_redemptions": None,
                "eligible_ticket_type_ids": [],
                "code": "LOAD10",
            },
        )
        expect(r, 201, "campaign")
        orders = a.history_tickets // per_order
        buyers = self.names("buyer")
        plan = defaultdict(list)
        for i in range(orders):
            plan[buyers[i % len(buyers)]].append("LOAD10" if i % 2 else None)

        async def buyer_orders(buyer, promos):
            for promo in promos:
                await self.buy(buyer, event["id"], ticket_type["id"], per_order, True, promo)

        await asyncio.gather(*(buyer_orders(b, p) for b, p in plan.items()))
        return {"event_id": event["id"], "tickets": orders * per_order, "orders": orders}

    # ----------------------------------------------------------------- one run

    async def prepare_run(self, label):
        a = self.args
        await self.login_all()
        checkout_event, checkout_type = await self.create_event(
            f"Load checkout {label}", a.capacity, "paid", 1, price_minor=500000
        )
        admitted = a.scanners * a.tickets_per_scanner
        admission_event, admission_type = await self.create_event(
            f"Load admission {label}", admitted, "free", 100
        )
        owner = self.headers("owner")
        for name in self.names("scanner"):
            r = await self.client.put(
                f"/api/v1/events/{admission_event['id']}/staff",
                headers=owner,
                json={"member_id": self.members[name], "capabilities": ["scan"]},
            )
            expect(r, 200, "assign scanner")
        attendees = self.names("attendee")
        share = [admitted // len(attendees)] * len(attendees)
        for i in range(admitted % len(attendees)):
            share[i] += 1
        orders = await asyncio.gather(
            *(
                self.buy(name, admission_event["id"], admission_type["id"], n, False)
                for name, n in zip(attendees, share, strict=True)
                if n
            )
        )
        tickets = []
        for name, order in zip(
            [n for n, q in zip(attendees, share, strict=True) if q], orders, strict=True
        ):
            for item in order["items"]:
                tickets.append({"attendee": name, **item["ticket"]})
        if len(tickets) != admitted:
            raise SetupError(f"expected {admitted} admission tickets, got {len(tickets)}")
        return {
            "checkout_event": checkout_event["id"],
            "checkout_type": checkout_type["id"],
            "admission_event": admission_event["id"],
            "tickets": tickets,
        }

    async def entry_confirmations(self, tickets, recorder):
        async def confirm(ticket):
            async with self.gate:
                r = await recorder.call(
                    self.client,
                    "prep.entry_confirmation",
                    "POST",
                    f"/api/v1/tickets/{ticket['id']}/entry-confirmations",
                    headers=self.headers(ticket["attendee"]),
                )
            ticket["confirmation"] = expect(r, 201, "entry confirmation")["token"]

        await asyncio.gather(*(confirm(t) for t in tickets))

    def scan_plans(self, tickets):
        a = self.args
        rng = random.Random(a.seed)
        own = [
            tickets[i * a.tickets_per_scanner : (i + 1) * a.tickets_per_scanner]
            for i in range(a.scanners)
        ]
        plans = []
        for i in range(a.scanners):
            duplicates = (
                own[(i + 1) % a.scanners][: a.duplicates_per_scanner] if a.scanners > 1 else []
            )
            plan = [(t, "own") for t in own[i]] + [(t, "duplicate") for t in duplicates]
            rng.shuffle(plan)
            plans.append(plan)
        return plans

    async def run_once(self, scenario, index):
        a = self.args
        label = f"{scenario}{index}"
        print(f"[{label}] preparing dataset", flush=True)
        data = await self.prepare_run(label)
        prep = Recorder()
        await self.entry_confirmations(data["tickets"], prep)
        plans = self.scan_plans(data["tickets"])
        recorder = Recorder()
        start = asyncio.Event()
        stop = asyncio.Event()
        flows = []
        scan_results = defaultdict(list)

        async def buyer(name):
            await start.wait()
            headers = self.headers(name)
            began = time.perf_counter()
            r = await recorder.call(
                self.client,
                "checkout.hold",
                "POST",
                f"/api/v1/events/{data['checkout_event']}/holds",
                headers=headers | {"Idempotency-Key": str(uuid.uuid4())},
                json={"items": [{"ticket_type_id": data["checkout_type"], "quantity": 1}]},
            )
            if r is None or r.status_code != 201:
                code = error_code(r) if r is not None else "transport"
                flows.append("sold_out" if code in SOLD_OUT_CODES else f"hold:{status(r)}:{code}")
                return
            hold = r.json()
            body = {
                "recipients": [
                    {
                        "allocation_id": hold["allocations"][0]["id"],
                        "name": name.title(),
                        "email": self.accounts[name].email,
                    }
                ]
            }
            r = await recorder.call(
                self.client,
                "checkout.checkout",
                "POST",
                f"/api/v1/holds/{hold['id']}/checkout",
                headers=headers | {"Idempotency-Key": str(uuid.uuid4())},
                json=body,
            )
            if r is None or r.status_code != 200:
                flows.append(f"checkout:{status(r)}:{error_code(r) if r is not None else None}")
                return
            order = r.json()
            r = await recorder.call(
                self.client,
                "checkout.payment",
                "POST",
                f"/api/v1/simulator/payments/{order['payment']['id']}/events",
                headers=headers,
                json={"outcome": "succeeded"},
            )
            if r is None or r.status_code != 200:
                flows.append(f"payment:{status(r)}:{error_code(r) if r is not None else None}")
                return
            r = await recorder.call(
                self.client,
                "checkout.order_read",
                "GET",
                f"/api/v1/orders/{order['id']}",
                headers=headers,
            )
            confirmed = r is not None and r.status_code == 200 and r.json()["status"] == "confirmed"
            # The whole buyer journey as one sample; 599 marks a flow that ended unconfirmed.
            recorder.add(
                "checkout.flow_e2e",
                200 if confirmed else 599,
                None if confirmed else "not_confirmed",
                time.perf_counter() - began,
                began,
            )
            flows.append("confirmed" if confirmed else f"order:{status(r)}")

        async def scanner(i):
            headers = self.headers(f"scanner-{i}")
            await start.wait()
            for ticket, kind in plans[i]:
                r = await recorder.call(
                    self.client,
                    "admission.check_in",
                    "POST",
                    f"/api/v1/scanner/events/{data['admission_event']}/check-ins",
                    headers=headers,
                    json={
                        "qr_payload": ticket["qr_payload"],
                        "entry_confirmation": ticket["confirmation"],
                        "operation_id": str(uuid.uuid4()),
                    },
                )
                scan_results[ticket["id"]].append(
                    (kind, status(r), error_code(r) if r is not None else None)
                )

        targets = [
            ("analytics.summary", f"/api/v1/events/{data['checkout_event']}/analytics", {}),
            (
                "analytics.series",
                f"/api/v1/events/{data['checkout_event']}/analytics/sales-series",
                {"bucket": "hour"},
            ),
            ("analytics.summary", f"/api/v1/events/{data['admission_event']}/analytics", {}),
            (
                "analytics.series",
                f"/api/v1/events/{data['admission_event']}/analytics/sales-series",
                {"bucket": "day"},
            ),
        ]
        if self.history:
            hid = self.history["event_id"]
            targets += [
                ("analytics.summary", f"/api/v1/events/{hid}/analytics", {}),
                (
                    "analytics.series",
                    f"/api/v1/events/{hid}/analytics/sales-series",
                    {"bucket": "hour"},
                ),
            ]

        async def analytics(i):
            headers = self.headers("owner")
            offset = i % len(targets)
            n = 0
            while not stop.is_set():
                op, path, params = targets[(offset + n) % len(targets)]
                await recorder.call(self.client, op, "GET", path, headers=headers, params=params)
                n += 1

        analytics_tasks = []
        if scenario == "B":
            analytics_tasks = [
                asyncio.create_task(analytics(i)) for i in range(a.analytics_clients)
            ]
            await asyncio.sleep(a.analytics_warmup)
        work = [asyncio.create_task(buyer(n)) for n in self.names("buyer")]
        work += [asyncio.create_task(scanner(i)) for i in range(a.scanners)]
        await asyncio.sleep(0.05)
        print(f"[{label}] timed phase", flush=True)
        began = time.perf_counter()
        start.set()
        await asyncio.gather(*work)
        window = time.perf_counter() - began
        stop.set()
        await asyncio.gather(*analytics_tasks)
        in_window = [
            s for s in recorder.samples if s.started >= began or not s.op.startswith("analytics")
        ]
        stats = summarize(in_window, window)
        invariants = await self.check_invariants(data, flows, scan_results)
        failures = sum(1 for s in recorder.samples if s.status == 0 or 500 <= s.status < 599)
        invariants.append(
            {
                "name": "no 5xx or transport errors in the timed phase",
                "expected": 0,
                "actual": failures,
                "passed": failures == 0,
            }
        )
        result = {
            "scenario": scenario,
            "run": index,
            "window_seconds": round(window, 3),
            "checkout_flows": dict(Counter(flows)),
            "scan_outcomes": dict(
                Counter(
                    f"{k}:{s}" + (f" {c}" if c else "")
                    for v in scan_results.values()
                    for k, s, c in v
                )
            ),
            "stats": stats,
            "prep": summarize(prep.samples, 0),
            "invariants": invariants,
        }
        bad = [i["name"] for i in invariants if not i["passed"]]
        admit = stats.get("admission.check_in", {})
        print(
            f"[{label}] window={window:.2f}s admission p95={admit.get('p95_ms')}ms "
            f"checkout e2e p95={stats.get('checkout.flow_e2e', {}).get('p95_ms')}ms "
            f"flows={dict(Counter(flows))} invariants={'OK' if not bad else 'FAILED ' + str(bad)}",
            flush=True,
        )
        return result

    # ----------------------------------------------------------------- invariants

    async def check_invariants(self, data, flows, scan_results):
        a = self.args
        owner = self.headers("owner")
        checks = []

        def check(name, expected, actual, passed=None):
            ok = expected == actual if passed is None else passed
            checks.append(
                {"name": name, "expected": expected, "actual": actual, "passed": bool(ok)}
            )

        ce, ae = data["checkout_event"], data["admission_event"]
        db = await asyncio.to_thread(self._database_counts, ce, ae)
        confirmed = flows.count("confirmed")
        expected_sold = min(a.buyers, a.capacity)
        check(
            "checkout: issued tickets <= capacity (no overselling)",
            f"<= {a.capacity}",
            db["checkout_tickets"],
            db["checkout_tickets"] <= a.capacity,
        )
        check(
            "checkout: sold allocations <= capacity",
            f"<= {a.capacity}",
            db["checkout_sold_allocations"],
            db["checkout_sold_allocations"] <= a.capacity,
        )
        check(
            "checkout: confirmed orders == successful client flows",
            confirmed,
            db["checkout_confirmed_orders"],
        )
        check(
            "checkout: tickets == confirmed orders (1 per order)",
            db["checkout_confirmed_orders"],
            db["checkout_tickets"],
        )
        check(
            "checkout: all capacity sold to the racing buyers",
            expected_sold,
            db["checkout_tickets"],
        )
        check(
            "checkout: losers rejected as sold out",
            a.buyers - expected_sold,
            flows.count("sold_out"),
        )
        check("checkout: no live holds left", 0, db["checkout_active_holds"])
        summary = (await self.client.get(f"/api/v1/events/{ce}/analytics", headers=owner)).json()
        check(
            "checkout: analytics inventory.sold == issued tickets",
            db["checkout_tickets"],
            summary["inventory"]["sold"],
        )
        check(
            "checkout: analytics available == capacity - sold",
            a.capacity - db["checkout_tickets"],
            summary["inventory"]["available"],
        )

        tickets = len(data["tickets"])
        accepted = {t: sum(1 for _, s, _ in v if s == 200) for t, v in scan_results.items()}
        scans = [(s, c) for v in scan_results.values() for _, s, c in v]
        rejected = [(s, c) for s, c in scans if s != 200]
        check(
            "admission: every ticket admitted exactly once (HTTP)",
            tickets,
            sum(1 for n in accepted.values() if n == 1),
        )
        check(
            "admission: no ticket admitted twice (HTTP)",
            0,
            sum(1 for n in accepted.values() if n > 1),
        )
        check("admission: current check-ins in DB == tickets", tickets, db["admission_check_ins"])
        check("admission: tickets with >1 check-in row in DB", 0, db["admission_multi_check_ins"])
        check(
            "admission: tickets in checked_in status", tickets, db["admission_checked_in_tickets"]
        )
        check(
            "admission: duplicate scans rejected",
            a.scanners * a.duplicates_per_scanner if a.scanners > 1 else 0,
            len(rejected),
        )
        check(
            "admission: duplicates rejected as 409 already_checked_in",
            len(rejected),
            sum(1 for s, c in rejected if s == 409 and c == "already_checked_in"),
        )
        counts = (
            await self.client.get(
                f"/api/v1/scanner/events/{ae}/counts", headers=self.headers("scanner-0")
            )
        ).json()
        check("admission: scanner counts endpoint admitted", tickets, counts["admitted"])
        summary = (await self.client.get(f"/api/v1/events/{ae}/analytics", headers=owner)).json()
        check(
            "admission: analytics attendance.checked_in",
            tickets,
            summary["attendance"]["checked_in"],
        )
        return checks

    def _database_counts(self, checkout_event, admission_event):
        params = {"ce": checkout_event, "ae": admission_event}
        sql = {
            "checkout_tickets": "SELECT count(*) FROM biletflow.ticket WHERE event_id = :ce "
            "AND status IN ('valid','checked_in')",
            "checkout_sold_allocations": "SELECT count(*) FROM biletflow.inventory_allocation "
            "WHERE event_id = :ce AND state IN ('sold','refund_quarantine')",
            "checkout_confirmed_orders": "SELECT count(*) FROM biletflow.ticket_order "
            "WHERE event_id = :ce AND status = 'confirmed'",
            "checkout_active_holds": "SELECT count(*) FROM biletflow.checkout_hold "
            "WHERE event_id = :ce AND status = 'active'",
            "admission_check_ins": "SELECT count(*) FROM biletflow.check_in "
            "WHERE event_id = :ae AND reversed_at IS NULL",
            "admission_multi_check_ins": "SELECT count(*) FROM (SELECT ticket_id FROM "
            "biletflow.check_in WHERE event_id = :ae GROUP BY ticket_id HAVING count(*) > 1) x",
            "admission_checked_in_tickets": "SELECT count(*) FROM biletflow.ticket "
            "WHERE event_id = :ae AND status = 'checked_in'",
        }
        with self.engine.connect() as connection:
            return {k: connection.execute(text(q), params).scalar_one() for k, q in sql.items()}

    def dataset_totals(self):
        tables = [
            "app_user",
            "event",
            "ticket_order",
            "order_item",
            "ticket",
            "inventory_allocation",
            "payment_attempt",
            "check_in",
            "entry_confirmation",
            "outbox_job",
        ]
        with self.engine.connect() as connection:
            return {
                t: connection.execute(text(f'SELECT count(*) FROM biletflow."{t}"')).scalar_one()
                for t in tables
            }


def status(response):
    return 0 if response is None else response.status_code


# --------------------------------------------------------------------------- reporting


KEY_OPS = [
    "admission.check_in",
    "checkout.hold",
    "checkout.checkout",
    "checkout.payment",
    "checkout.order_read",
    "checkout.flow_e2e",
    "analytics.summary",
    "analytics.series",
]


def aggregate(runs):
    out = {}
    for scenario in sorted({r["scenario"] for r in runs}):
        chosen = [r for r in runs if r["scenario"] == scenario]
        ops = {}
        for op in KEY_OPS:
            stats = [r["stats"][op] for r in chosen if op in r["stats"]]
            if not stats:
                continue
            p95 = [s["p95_ms"] for s in stats]
            ops[op] = {
                "runs": len(stats),
                "requests": sum(s["count"] for s in stats),
                "non_2xx": sum(s["count"] - s["ok"] for s in stats),
                "server_errors": sum(s["server_errors"] + s["transport_errors"] for s in stats),
                "p50_ms_median": statistics.median(s["p50_ms"] for s in stats),
                "p95_ms_per_run": p95,
                "p95_ms_median": statistics.median(p95),
                "p95_ms_worst": max(p95),
                "p99_ms_worst": max(s["p99_ms"] for s in stats),
                "max_ms_worst": max(s["max_ms"] for s in stats),
                "throughput_rps_median": statistics.median(s["throughput_rps"] for s in stats),
            }
        out[scenario] = {
            "runs": len(chosen),
            "window_seconds": [r["window_seconds"] for r in chosen],
            "invariants_passed": all(i["passed"] for r in chosen for i in r["invariants"]),
            "ops": ops,
        }
    return out


def markdown(report):
    lines = [
        f"# BiletFlow load results ({report['started_at']})",
        "",
        "Percentiles are nearest-rank over every request of a run; the table shows the median of "
        "the runs' p95 and the worst run's p95/p99/max.",
        "",
        "| Scenario | Operation | Runs | Requests | Non-2xx | 5xx/transport | p50 (median) | "
        "p95 (median) | p95 (worst) | p99 (worst) | max (worst) | req/s (median) |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for scenario, data in report["aggregate"].items():
        for op, s in data["ops"].items():
            lines.append(
                f"| {scenario} | `{op}` | {s['runs']} | {s['requests']} | {s['non_2xx']} | "
                f"{s['server_errors']} | {s['p50_ms_median']} ms | {s['p95_ms_median']} ms | "
                f"{s['p95_ms_worst']} ms | {s['p99_ms_worst']} ms | {s['max_ms_worst']} ms | "
                f"{s['throughput_rps_median']} |"
            )
    lines += ["", "## Runs", ""]
    for run in report["runs"]:
        failed = [i for i in run["invariants"] if not i["passed"]]
        lines.append(
            f"- {run['scenario']}{run['run']}: window {run['window_seconds']} s; checkout flows "
            f"{run['checkout_flows']}; scans {run['scan_outcomes']}; invariants "
            + ("all passed" if not failed else "FAILED: " + "; ".join(i["name"] for i in failed))
        )
    target = report["admission_target"]
    lines += [
        "",
        f"Admission p95 target {target['target_ms']} ms: worst run p95 {target['worst_p95_ms']} ms "
        f"-> {'met' if target['met'] else 'NOT met'}.",
        "",
    ]
    return "\n".join(lines)


def environment(stack):
    def run(*command):
        try:
            return subprocess.run(
                command, capture_output=True, text=True, check=True
            ).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            return None

    engine = create_engine(stack.database_url)
    with engine.connect() as connection:
        pg = connection.execute(text("SHOW server_version")).scalar_one()
        max_connections = connection.execute(text("SHOW max_connections")).scalar_one()
    engine.dispose()
    import fastapi
    import sqlalchemy
    import uvicorn

    return {
        "cpu": run("sysctl", "-n", "machdep.cpu.brand_string") or platform.processor(),
        "logical_cpus": os.cpu_count(),
        "memory_bytes": run("sysctl", "-n", "hw.memsize"),
        "os": platform.platform(),
        "python": platform.python_version(),
        "postgresql": pg,
        "postgresql_max_connections": max_connections,
        "uvicorn": uvicorn.__version__,
        "fastapi": fastapi.__version__,
        "sqlalchemy": sqlalchemy.__version__,
        "httpx": httpx.__version__,
        "api_processes": 1,
        "api_db_pool": "SQLAlchemy default QueuePool (5 + 10 overflow)",
        "worker_processes": 1,
        "client": "same machine, one asyncio process, httpx.AsyncClient over loopback",
        "git_revision": run("git", "-C", str(BACKEND), "rev-parse", "--short", "HEAD"),
    }


# --------------------------------------------------------------------------- entry point


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument(
        "--database-url",
        default=os.environ.get("LOAD_DATABASE_URL") or os.environ.get("TEST_DATABASE_URL"),
        help="disposable PostgreSQL URL whose database name ends in _test",
    )
    p.add_argument(
        "--scenarios", default="A,B", help="comma-separated: A baseline, B with analytics"
    )
    p.add_argument(
        "--runs", type=int, default=3, help="runs per scenario (interleaved A1 B1 A2 ...)"
    )
    p.add_argument("--buyers", type=int, default=50, help="concurrent checkout attempts")
    p.add_argument("--capacity", type=int, default=40, help="tickets on the constrained event")
    p.add_argument("--scanners", type=int, default=10, help="concurrent scanner clients")
    p.add_argument("--tickets-per-scanner", type=int, default=20)
    p.add_argument("--duplicates-per-scanner", type=int, default=5)
    p.add_argument("--attendees", type=int, default=20, help="accounts holding admission tickets")
    p.add_argument("--analytics-clients", type=int, default=5, help="scenario B organizer clients")
    p.add_argument("--analytics-warmup", type=float, default=1.0, help="seconds before the start")
    p.add_argument(
        "--history-tickets", type=int, default=400, help="sold paid tickets for analytics"
    )
    p.add_argument("--setup-concurrency", type=int, default=16)
    p.add_argument("--seed", type=int, default=80)
    p.add_argument(
        "--output-dir",
        default=os.path.join(tempfile.gettempdir(), "biletflow-load"),
        help="results, server and worker logs (a timestamped subdirectory is created)",
    )
    p.add_argument("--keep-storage", action="store_true", help="keep generated ticket files")
    args = p.parse_args(argv)
    if not args.database_url:
        p.error("set --database-url, LOAD_DATABASE_URL or TEST_DATABASE_URL")
    if not make_url(args.database_url).database.endswith("_test"):
        p.error("refusing to load a database whose name does not end in _test")
    if args.attendees < 1 or args.buyers < 1 or args.scanners < 1:
        p.error("buyers, scanners and attendees must be positive")
    return args


async def main_async(args, stack):
    started = datetime.now(UTC)
    runs = []
    limits = httpx.Limits(max_connections=None, max_keepalive_connections=500)
    async with httpx.AsyncClient(base_url=stack.base_url, timeout=120, limits=limits) as client:
        harness = Harness(args, stack)
        harness.client = client
        print("setting up accounts, organization and history event", flush=True)
        await harness.setup_global()
        scenarios = [s.strip().upper() for s in args.scenarios.split(",") if s.strip()]
        for index in range(1, args.runs + 1):
            for scenario in scenarios:
                runs.append(await harness.run_once(scenario, index))
        totals = harness.dataset_totals()
        harness.engine.dispose()
    aggregate_ = aggregate(runs)
    p95s = [
        r["stats"]["admission.check_in"]["p95_ms"]
        for r in runs
        if "admission.check_in" in r["stats"]
    ]
    worst = max(p95s) if p95s else None
    return {
        "started_at": started.isoformat(timespec="seconds"),
        "finished_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "parameters": {k: v for k, v in vars(args).items() if k != "database_url"}
        | {"database": make_url(args.database_url).database, "status": "proposed baseline"},
        "server_settings": {
            "RATE_IP_LIMIT": RATE_LIMIT_FOR_LOAD,
            "RATE_IDENTITY_LIMIT": RATE_LIMIT_FOR_LOAD,
            "ENVIRONMENT": "test",
            "ADMISSION_REQUIRE_ENTRY_CONFIRMATION": True,
            "ACCESS_MINUTES": 30,
        },
        "history": harness.history,
        "dataset_totals_after": totals,
        "runs": runs,
        "aggregate": aggregate_,
        "admission_target": {
            "target_ms": ADMISSION_TARGET_SECONDS * 1000,
            "worst_p95_ms": worst,
            "met": worst is not None and worst < ADMISSION_TARGET_SECONDS * 1000,
        },
    }


def run(args):
    output = Path(args.output_dir) / datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    output.mkdir(parents=True, exist_ok=True)
    stack = Stack(args.database_url, output)
    print(f"output: {output}", flush=True)
    stack.migrate()
    sink = SmtpSink()
    sink.start()
    from app.db import database
    from app.seed import seed_catalog

    engine, factory = database(args.database_url)
    seed_catalog(factory)
    engine.dispose()
    try:
        stack.start(sink.port)
        report = asyncio.run(main_async(args, stack))
    finally:
        stack.stop()
        sink.stop()
        if not args.keep_storage:
            shutil.rmtree(output / "storage", ignore_errors=True)
    report["environment"] = environment(stack)
    report["smtp_messages_delivered"] = sink.messages
    report["output_dir"] = str(output)
    (output / "results.json").write_text(json.dumps(report, indent=2))
    (output / "results.md").write_text(markdown(report))
    print(markdown(report))
    return report


def passed(report):
    invariants = all(i["passed"] for r in report["runs"] for i in r["invariants"])
    return invariants and report["admission_target"]["met"]


def main(argv=None):
    report = run(parse_args(argv))
    return 0 if passed(report) else 1


if __name__ == "__main__":
    sys.exit(main())
