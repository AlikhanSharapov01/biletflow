import asyncio
import contextlib
from typing import Literal
from uuid import UUID

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query, Response, WebSocket
from fastapi.concurrency import run_in_threadpool
from fastapi.encoders import jsonable_encoder

from . import support_schemas as s
from .security import decode_access
from .service import valid_session
from .support_models import CATEGORIES, STATUSES, SupportCase
from .support_service import (
    assign,
    case_roles,
    case_views,
    change_status,
    change_views,
    escalate,
    get_case,
    list_cases,
    message_page,
    message_views,
    open_case,
    post_message,
    updates,
)

POLL_SECONDS = 2.0
AUTH_SECONDS = 10.0
MAX_SUBSCRIPTIONS = 20
BATCH = 100


class Hub:
    """In-process wake-up after commit. Delivery itself always re-reads PostgreSQL, so a lost
    wake-up, another API process, or a dead socket never loses or duplicates a message."""

    def __init__(self):
        self.loop = None
        self.connections = set()

    def publish(self, case_id):
        try:
            if self.loop is not None and not self.loop.is_closed():
                self.loop.call_soon_threadsafe(self.wake, case_id)
        except Exception:  # noqa: BLE001 - live delivery must never fail the business result
            pass

    def wake(self, case_id):
        for connection in list(self.connections):
            if case_id in connection.subs:
                connection.wake.set()


class Connection:
    def __init__(self, ids):
        self.ids = ids
        self.wake = asyncio.Event()
        self.subs = {}


def router(factory, settings, principal):
    routes = APIRouter(prefix="/api/v1/support", tags=["support"])
    hub = Hub()

    @routes.post("/cases", response_model=s.CaseCreated, status_code=201)
    def create_case(data: s.CaseCreate, response: Response, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            case, first, replayed = open_case(db, user, data)
            roles = case_roles(db, user, case)
            result = {
                "case": case_views(db, [(case, roles)])[0],
                "message": message_views(db, case, [first], replayed)[0],
            }
            case_id = case.id
        if replayed:
            response.status_code = 200
        else:
            hub.publish(case_id)
        return result

    @routes.get("/cases", response_model=s.CasePage)
    def cases(
        ids=Depends(principal),
        view: Literal["mine", "queue"] = "mine",
        status: Literal[STATUSES] | None = None,
        category: Literal[CATEGORIES] | None = None,
        event_id: UUID | None = None,
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            total, rows = list_cases(db, user, view, status, category, event_id, limit, offset)
            return {
                "items": case_views(db, rows),
                "total": total,
                "limit": limit,
                "offset": offset,
            }

    @routes.get("/cases/{case_id}", response_model=s.CaseView)
    def case_detail(case_id: UUID, ids=Depends(principal)):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            case, roles = get_case(db, user, case_id)
            return case_views(db, [(case, roles)])[0]

    @routes.get("/cases/{case_id}/messages")
    def messages(
        case_id: UUID,
        ids=Depends(principal),
        after: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=100),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            case, _ = get_case(db, user, case_id)
            return jsonable_encoder(message_page(db, case, after, limit))

    @routes.get("/cases/{case_id}/updates", response_model=s.UpdatePage)
    def case_updates(
        case_id: UUID,
        ids=Depends(principal),
        after: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=100),
    ):
        with factory() as db:
            user, _ = valid_session(db, *ids)
            case, _ = get_case(db, user, case_id)
            return jsonable_encoder(updates(db, case, after, limit))

    @routes.post("/cases/{case_id}/messages", response_model=s.MessageView, status_code=201)
    def send_message(
        case_id: UUID, data: s.MessageCreate, response: Response, ids=Depends(principal)
    ):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            case, _, row, replayed = post_message(db, user, case_id, data)
            result = message_views(db, case, [row], replayed)[0]
        if replayed:
            response.status_code = 200
        else:
            hub.publish(case_id)
        return result

    @routes.post("/cases/{case_id}/status", response_model=s.ChangeView)
    def set_case_status(case_id: UUID, data: s.StatusChange, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            case, _, row = change_status(db, user, case_id, data)
            result = change_views(db, [row])[0]
        hub.publish(case_id)
        return result

    @routes.post("/cases/{case_id}/assignment", response_model=s.ChangeView)
    def assign_case(case_id: UUID, data: s.Assignment, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            case, _, row = assign(db, user, case_id, data)
            result = change_views(db, [row])[0]
        hub.publish(case_id)
        return result

    @routes.post("/cases/{case_id}/escalation", response_model=s.ChangeView)
    def escalate_case(case_id: UUID, data: s.Escalation, ids=Depends(principal)):
        with factory.begin() as db:
            user, _ = valid_session(db, *ids, lock=True)
            case, _, row = escalate(db, user, case_id, data)
            result = change_views(db, [row])[0]
        hub.publish(case_id)
        return result

    def fetch(ids, case_id, after):
        # Authorization is re-evaluated on every delivery, so revoked staff, ended sessions
        # and de-escalated relationships stop receiving immediately.
        with factory() as db:
            try:
                user, _ = valid_session(db, *ids)
            except HTTPException:
                return "session_ended", None
            case = db.get(SupportCase, case_id)
            if not case or not case_roles(db, user, case):
                return "case_not_found", None
            return "ok", jsonable_encoder(updates(db, case, after, BATCH))

    @routes.websocket("/ws")
    async def live(websocket: WebSocket):
        """Authenticate with a first {"type":"auth","token":<access token>} frame (browsers
        cannot set headers and a URL token would reach access logs), then subscribe per case."""
        origin = websocket.headers.get("origin")
        if origin and origin not in settings.allowed_origins:
            await websocket.close(code=1008)
            return
        await websocket.accept()
        hub.loop = asyncio.get_running_loop()
        connection = Connection(None)
        try:
            frame = await asyncio.wait_for(websocket.receive_json(), AUTH_SECONDS)
            token = frame["token"] if frame["type"] == "auth" else None
            connection.ids = decode_access(settings, token)
            await run_in_threadpool(lambda: valid_session_check(connection.ids))
        except Exception:  # noqa: BLE001 - every malformed or unauthorized start is the same
            with contextlib.suppress(Exception):
                await websocket.send_json({"type": "error", "code": "unauthorized"})
                await websocket.close(code=4401)
            return
        await websocket.send_json({"type": "ready"})

        async def reader():
            while True:
                frame = await websocket.receive_json()
                kind = frame.get("type") if isinstance(frame, dict) else None
                if kind == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue
                try:
                    case_id = UUID(str(frame.get("case_id")))
                    after = int(frame.get("after", 0))
                    if after < 0 or kind not in ("subscribe", "unsubscribe"):
                        raise ValueError
                except (ValueError, AttributeError, TypeError):
                    await websocket.send_json({"type": "error", "code": "invalid_frame"})
                    continue
                if kind == "unsubscribe":
                    connection.subs.pop(case_id, None)
                    await websocket.send_json({"type": "unsubscribed", "case_id": str(case_id)})
                    continue
                if case_id not in connection.subs and len(connection.subs) >= MAX_SUBSCRIPTIONS:
                    await websocket.send_json({"type": "error", "code": "too_many_subscriptions"})
                    continue
                state, _ = await run_in_threadpool(fetch, connection.ids, case_id, after)
                if state != "ok":
                    await websocket.send_json(
                        {"type": "error", "code": state, "case_id": str(case_id)}
                    )
                    if state == "session_ended":
                        await websocket.close(code=4401)
                        return
                    continue
                connection.subs[case_id] = after
                await websocket.send_json(
                    {"type": "subscribed", "case_id": str(case_id), "after": after}
                )
                connection.wake.set()

        async def pusher():
            while True:
                with anyio.move_on_after(POLL_SECONDS):
                    await connection.wake.wait()
                connection.wake.clear()
                for case_id, cursor in list(connection.subs.items()):
                    state, page = await run_in_threadpool(fetch, connection.ids, case_id, cursor)
                    if state == "session_ended":
                        await websocket.send_json({"type": "error", "code": state})
                        await websocket.close(code=4401)
                        return
                    if state != "ok":
                        connection.subs.pop(case_id, None)
                        await websocket.send_json(
                            {"type": "error", "code": state, "case_id": str(case_id)}
                        )
                        continue
                    for item in page["items"]:
                        await websocket.send_json(
                            {"type": "event", "case_id": str(case_id), "item": item}
                        )
                    if case_id in connection.subs:
                        connection.subs[case_id] = page["next_after"]
                    if page["has_more"]:
                        connection.wake.set()

        async def guarded(work):
            # Either side ending (disconnect, revoked session, failed send) ends the connection;
            # nothing here can touch the already committed business result.
            try:
                await work()
            except Exception:  # noqa: BLE001
                pass
            group.cancel_scope.cancel()

        hub.connections.add(connection)
        try:
            async with anyio.create_task_group() as group:
                group.start_soon(guarded, reader)
                group.start_soon(guarded, pusher)
        finally:
            hub.connections.discard(connection)
            with contextlib.suppress(Exception):
                await websocket.close()

    def valid_session_check(ids):
        with factory() as db:
            valid_session(db, *ids)

    return routes
