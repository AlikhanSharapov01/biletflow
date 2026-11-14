"""BF-15: notification intents, fan-out and email delivery.

Business code only writes one small `notification_fanout` outbox row inside its own transaction
(see the enqueue_* hooks). The worker later turns it into per-recipient `notification` rows
(the in-app inbox) and `notification_delivery` rows (email retry bookkeeping). A delivery
failure therefore never touches the business result, and a replayed operation maps to the same
deduplication keys, so it cannot create a second intent.
"""

import smtplib
from datetime import datetime, timedelta
from email.message import EmailMessage
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert

from .catalog_models import Event
from .checkout_models import Ticket, TicketOrder
from .models import OutboxJob, User
from .notification_models import Notification, NotificationDelivery
from .security import now

FANOUT_KIND = "notification_fanout"
LOCALES = ("kk", "ru", "en")
FALLBACK_LOCALE = "en"
MAX_ATTEMPTS = 5
LEASE_SECONDS = 120

# kind -> channels. ticket_delivered is in-app only: the ticket email is sent by the existing
# ticket_delivery_email job and must not be duplicated. The support kinds are in-app only for
# the same reason: the support worker already emails a link (support_email).
CHANNELS = {
    "payout_status": ("in_app", "email"),
    "event_updated": ("in_app", "email"),
    "event_cancelled": ("in_app", "email"),
    "ticket_delivered": ("in_app",),
    "support_reply": ("in_app",),
    "support_status": ("in_app",),
    "purchase_confirmed": ("in_app", "email"),
    "payment_failed": ("in_app", "email"),
    "refund_started": ("in_app", "email"),
    "refund_completed": ("in_app", "email"),
    "order_cancelled": ("in_app", "email"),
}
ORDER_NOTICES = (
    "purchase_confirmed",
    "payment_failed",
    "refund_started",
    "refund_completed",
    "order_cancelled",
)

TEMPLATES = {
    "event_updated": {
        "en": (
            "Event updated: {title}",
            "The details of {title} have changed. It now starts {when} ({zone}).\n"
            "Review the latest information and download the updated calendar file: {link}",
        ),
        "ru": (
            "Мероприятие изменено: {title}",
            "Данные мероприятия {title} изменились. Начало: {when} ({zone}).\n"
            "Актуальная информация и обновлённый файл календаря: {link}",
        ),
        "kk": (
            "Іс-шара өзгерді: {title}",
            "{title} іс-шарасының мәліметтері өзгерді. Басталуы: {when} ({zone}).\n"
            "Өзекті ақпарат және жаңартылған күнтізбе файлы: {link}",
        ),
    },
    "event_cancelled": {
        "en": (
            "Event cancelled: {title}",
            "{title}, planned for {when} ({zone}), has been cancelled.\nDetails: {link}",
        ),
        "ru": (
            "Мероприятие отменено: {title}",
            "Мероприятие {title}, запланированное на {when} ({zone}), отменено.\nПодробности: {link}",
        ),
        "kk": (
            "Іс-шара тоқтатылды: {title}",
            "{when} ({zone}) өтуі тиіс {title} іс-шарасы тоқтатылды.\nТолығырақ: {link}",
        ),
    },
    "ticket_delivered": {
        "en": (
            "Your ticket is ready: {title}",
            "Your ticket for {title} ({when}, {zone}) is ready: {link}",
        ),
        "ru": (
            "Ваш билет готов: {title}",
            "Ваш билет на {title} ({when}, {zone}) готов: {link}",
        ),
        "kk": (
            "Билетіңіз дайын: {title}",
            "{title} ({when}, {zone}) іс-шарасына билетіңіз дайын: {link}",
        ),
    },
    "support_reply": {
        "en": (
            "New reply on your support case",
            "There is a new reply on your support case: {link}",
        ),
        "ru": (
            "Новый ответ по обращению",
            "В вашем обращении в поддержку появился новый ответ: {link}",
        ),
        "kk": ("Өтінішіңізге жаңа жауап", "Қолдау өтінішіңізге жаңа жауап келді: {link}"),
    },
    "support_status": {
        "en": ("Support case status changed", "The status of your support case changed: {link}"),
        "ru": ("Статус обращения изменён", "Статус вашего обращения в поддержку изменился: {link}"),
        "kk": ("Өтініш мәртебесі өзгерді", "Қолдау өтінішіңіздің мәртебесі өзгерді: {link}"),
    },
    "purchase_confirmed": {
        "en": (
            "Order confirmed: {title}",
            "Your payment for {title} ({when}, {zone}) is confirmed. Your order: {link}",
        ),
        "ru": (
            "Заказ подтверждён: {title}",
            "Оплата за {title} ({when}, {zone}) подтверждена. Ваш заказ: {link}",
        ),
        "kk": (
            "Тапсырыс расталды: {title}",
            "{title} ({when}, {zone}) үшін төлем расталды. Тапсырысыңыз: {link}",
        ),
    },
    "payment_failed": {
        "en": (
            "Payment failed: {title}",
            "Your payment for {title} did not go through and no ticket was issued. "
            "You can try again while your reservation lasts: {link}",
        ),
        "ru": (
            "Оплата не прошла: {title}",
            "Оплата за {title} не прошла, билет не выпущен. "
            "Повторить можно, пока действует бронь: {link}",
        ),
        "kk": (
            "Төлем өтпеді: {title}",
            "{title} үшін төлем өтпеді, билет шығарылмады. "
            "Брондау мерзімі біткенше қайталай аласыз: {link}",
        ),
    },
    "refund_started": {
        "en": (
            "Refund started: {title}",
            "A refund has started for your order for {title}, and its tickets no longer "
            "admit anyone. Order: {link}",
        ),
        "ru": (
            "Возврат начат: {title}",
            "По вашему заказу на {title} начат возврат, билеты больше не действуют. Заказ: {link}",
        ),
        "kk": (
            "Қайтару басталды: {title}",
            "{title} тапсырысыңыз бойынша қайтару басталды, билеттер енді жарамсыз. "
            "Тапсырыс: {link}",
        ),
    },
    "refund_completed": {
        "en": (
            "Refund completed: {title}",
            "The refund for your order for {title} is complete. Order: {link}",
        ),
        "ru": (
            "Возврат завершён: {title}",
            "Возврат по вашему заказу на {title} завершён. Заказ: {link}",
        ),
        "kk": (
            "Қайтару аяқталды: {title}",
            "{title} тапсырысыңыз бойынша қайтару аяқталды. Тапсырыс: {link}",
        ),
    },
    "order_cancelled": {
        "en": (
            "Registration cancelled: {title}",
            "A registration for {title} was cancelled and its ticket no longer admits anyone. "
            "Order: {link}",
        ),
        "ru": (
            "Регистрация отменена: {title}",
            "Регистрация на {title} отменена, билет больше не действует. Заказ: {link}",
        ),
        "kk": (
            "Тіркеу тоқтатылды: {title}",
            "{title} іс-шарасына тіркеу тоқтатылды, билет енді жарамсыз. Тапсырыс: {link}",
        ),
    },
}


TEMPLATES["payout_status"] = {
    "en": ("Simulated payout: {status}", "Simulated payout: {status}. No real money moved. {link}"),
    "ru": (
        "Учебная выплата: {status}",
        "Учебная выплата: {status}. Реальные деньги не переводились. {link}",
    ),
    "kk": ("Оқу төлемі: {status}", "Оқу төлемі: {status}. Нақты ақша аударылған жоқ. {link}"),
}
PAYOUT_STATUSES = {
    "en": {
        "pending": "pending",
        "eligible": "eligible",
        "sent": "sent",
        "failed": "failed",
        "adjusted": "adjusted",
    },
    "ru": {
        "pending": "ожидает",
        "eligible": "доступна",
        "sent": "отправлена",
        "failed": "ошибка",
        "adjusted": "скорректирована",
    },
    "kk": {
        "pending": "күтуде",
        "eligible": "қолжетімді",
        "sent": "жіберілді",
        "failed": "қате",
        "adjusted": "түзетілді",
    },
}


def resolve_locale(value):
    """User locale when supported, otherwise English."""
    return value if value in LOCALES else FALLBACK_LOCALE


def target_of(kind, payload):
    if kind.startswith("support_"):
        return {"type": "support_case", "id": payload.get("case_id")}
    if kind == "ticket_delivered":
        return {"type": "ticket", "id": payload.get("ticket_id")}
    if kind in ORDER_NOTICES:
        return {"type": "order", "id": payload.get("order_id")}
    return {"type": "event", "id": payload.get("event_id")}


def target_path(kind, payload):
    target = target_of(kind, payload)
    folder = {
        "event": "events",
        "ticket": "tickets",
        "support_case": "support/cases",
        "order": "orders",
    }
    return f"/{folder[target['type']]}/{target['id']}"


def render(settings, kind, locale, payload):
    subject, body = TEMPLATES[kind][resolve_locale(locale)]
    zone_name = payload.get("time_zone") or "Asia/Almaty"
    when = ""
    if payload.get("starts_at"):
        when = datetime.fromisoformat(payload["starts_at"]).astimezone(ZoneInfo(zone_name))
        when = f"{when:%d.%m.%Y %H:%M}"
    values = {
        "status": PAYOUT_STATUSES[resolve_locale(locale)].get(payload.get("status"), ""),
        "title": payload.get("title", ""),
        "when": when,
        "zone": zone_name,
        "link": settings.frontend_url.rstrip("/") + target_path(kind, payload),
    }
    return subject.format(**values), body.format(**values)


# ---------------------------------------------------------------------------
# Hooks called inside the caller's business transaction. They only insert one outbox row.
# ---------------------------------------------------------------------------


def enqueue(db, dedupe, payload, event_id=None):
    db.execute(
        insert(OutboxJob)
        .values(
            id=uuid4(),
            event_id=event_id,
            kind=FANOUT_KIND,
            deduplication_key=dedupe,
            payload={"version": 1, **payload},
        )
        .on_conflict_do_nothing(index_elements=["deduplication_key"])
    )


def enqueue_event_notice(db, event, notice):
    """notice is 'updated' or 'cancelled'. Keyed by calendar_sequence so each edit notifies once."""
    enqueue(
        db,
        f"notify-event-{notice}:{event.id}:{event.calendar_sequence}",
        {
            "notice": f"event_{notice}",
            "event_id": str(event.id),
            "calendar_sequence": event.calendar_sequence,
        },
        event.id,
    )


def enqueue_ticket_delivered(db, ticket_id, event_id):
    enqueue(
        db,
        f"notify-ticket:{ticket_id}",
        {"notice": "ticket_delivered", "ticket_id": str(ticket_id), "event_id": str(event_id)},
        event_id,
    )


def enqueue_order_notice(db, notice, order, change_id, recipient_user_id=None):
    """change_id is the order, attempt, refund or ticket this notice is about, once each."""
    recipient = recipient_user_id or order.buyer_user_id
    enqueue(
        db,
        f"notify-{notice}:{change_id}:{recipient}",
        {
            "notice": notice,
            "order_id": str(order.id),
            "event_id": str(order.event_id),
            "recipient_user_id": str(recipient),
            "change_id": str(change_id),
        },
        order.event_id,
    )


def enqueue_support_notice(
    db, *, recipient_user_id, case_id, change, change_id, event_id=None, status=None
):
    """Hook for the support module, to be called in the transaction that persists the change.

    change is 'reply' or 'status'; change_id identifies that exact message or status change
    (for example the message or case_change id) and is the deduplication identity. The caller
    chooses recipients and has already authorised them against the case. Only IDs and the
    status label are stored: never message text.
    """
    if change not in ("reply", "status"):
        raise ValueError("change must be 'reply' or 'status'")
    payload = {
        "notice": f"support_{change}",
        "recipient_user_id": str(recipient_user_id),
        "case_id": str(case_id),
    }
    if event_id:
        payload["event_id"] = str(event_id)
    if status:
        payload["status"] = str(status)[:40]
    enqueue(
        db, f"notify-support-{change}:{case_id}:{change_id}:{recipient_user_id}", payload, event_id
    )


# ---------------------------------------------------------------------------
# Worker side.
# ---------------------------------------------------------------------------


def create_notification(db, user, kind, dedupe, event_id, payload):
    """Insert one inbox row plus its delivery rows. Returns None if the intent already exists."""
    created = db.scalar(
        insert(Notification)
        .values(
            recipient_user_id=user.id,
            event_id=event_id,
            kind=kind,
            locale=resolve_locale(user.locale),
            deduplication_key=dedupe,
            safe_payload=payload,
        )
        .on_conflict_do_nothing(constraint="notification_uq1")
        .returning(Notification.id)
    )
    if created is None:
        return None
    current = now()
    for channel in CHANNELS[kind]:
        if channel == "in_app":
            db.add(
                NotificationDelivery(
                    notification_id=created,
                    channel=channel,
                    status="sent",
                    attempt_count=1,
                    sent_at=current,
                )
            )
        else:
            db.add(
                NotificationDelivery(
                    notification_id=created, channel=channel, next_attempt_at=current
                )
            )
    return created


def event_payload(event, **extra):
    return {
        "version": 1,
        "event_id": str(event.id),
        "title": event.title,
        "starts_at": event.starts_at.isoformat(),
        "ends_at": event.ends_at.isoformat(),
        "time_zone": event.time_zone,
        "calendar_sequence": event.calendar_sequence,
        **extra,
    }


def event_audience(db, event_id, cancelled):
    ticket_states = (
        ("valid", "checked_in", "refund_pending", "refunded", "cancelled")
        if cancelled
        else ("valid", "checked_in")
    )
    order_states = ("confirmed", "refund_pending", "refunded") if cancelled else ("confirmed",)
    recipients = select(Ticket.recipient_user_id).where(
        Ticket.event_id == event_id,
        Ticket.recipient_user_id.is_not(None),
        Ticket.status.in_(ticket_states),
    )
    buyers = select(TicketOrder.buyer_user_id).where(
        TicketOrder.event_id == event_id, TicketOrder.status.in_(order_states)
    )
    ids = set(db.scalars(recipients)) | set(db.scalars(buyers))
    return sorted(ids, key=str)


def expand(db, payload):
    notice = payload["notice"]
    if notice in ("event_updated", "event_cancelled"):
        event = db.get(Event, UUID(payload["event_id"]))
        if not event:
            return
        sequence = payload["calendar_sequence"]
        data = event_payload(event, calendar_sequence=sequence)
        for user_id in event_audience(db, event.id, notice == "event_cancelled"):
            user = db.get(User, user_id)
            if user and user.status == "active":
                create_notification(
                    db, user, notice, f"{notice}:{event.id}:{sequence}", event.id, data
                )
    elif notice == "payout_status":
        from .activation_service import finance_event

        user = db.get(User, UUID(payload["recipient_user_id"]))
        if not user or user.status != "active":
            return
        try:
            _, event = finance_event(db, user, UUID(payload["event_id"]))
        except HTTPException:
            return
        create_notification(
            db,
            user,
            notice,
            f"payout:{payload['payout_id']}:{payload['status']}:{payload['change_id']}",
            event.id,
            event_payload(
                event, payout_id=payload["payout_id"], status=payload["status"], simulated=True
            ),
        )
    elif notice == "ticket_delivered":
        ticket = db.get(Ticket, UUID(payload["ticket_id"]))
        user = (
            db.get(User, ticket.recipient_user_id) if ticket and ticket.recipient_user_id else None
        )
        if user and user.status == "active" and ticket.status in ("valid", "checked_in"):
            event = db.get(Event, ticket.event_id)
            create_notification(
                db,
                user,
                notice,
                f"ticket-delivered:{ticket.id}",
                event.id,
                event_payload(event, ticket_id=str(ticket.id)),
            )
    elif notice in ("support_reply", "support_status"):
        user = db.get(User, UUID(payload["recipient_user_id"]))
        if user and user.status == "active":
            data = {"version": 1, "case_id": payload["case_id"]}
            if payload.get("status"):
                data["status"] = payload["status"]
            event_id = UUID(payload["event_id"]) if payload.get("event_id") else None
            key = f"{notice}:{payload['case_id']}:{payload.get('change_key') or uuid4()}"
            create_notification(db, user, notice, key, event_id, data)
    elif notice in ORDER_NOTICES:
        user = db.get(User, UUID(payload["recipient_user_id"]))
        event = db.get(Event, UUID(payload["event_id"]))
        if user and user.status == "active" and event:
            create_notification(
                db,
                user,
                notice,
                f"{notice}:{payload['change_id']}",
                event.id,
                event_payload(event, order_id=payload["order_id"]),
            )


def backoff(attempts):
    return now() + timedelta(seconds=min(300, 2**attempts))


def fanout_once(factory):
    """Process one fan-out intent. Returns False when nothing is due."""
    with factory.begin() as db:
        job = db.scalar(
            select(OutboxJob)
            .where(
                OutboxJob.kind == FANOUT_KIND,
                or_(
                    and_(OutboxJob.status == "pending", OutboxJob.available_at <= now()),
                    and_(OutboxJob.status == "leased", OutboxJob.lease_until <= now()),
                ),
            )
            .order_by(OutboxJob.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not job:
            return False
        if job.attempt_count >= MAX_ATTEMPTS:
            job.status, job.lease_token, job.lease_until = "dead", None, None
            job.last_error = "notification_fanout_exhausted"
            return True
        job.status, job.lease_token = "leased", uuid4()
        job.lease_until = now() + timedelta(seconds=LEASE_SECONDS)
        job.attempt_count += 1
        identifier, lease, payload = job.id, job.lease_token, dict(job.payload)
        payload.setdefault("change_key", job.deduplication_key)
    failure = False
    try:
        with factory.begin() as db:
            expand(db, payload)
    except Exception:
        # Keep no exception text: it could echo recipient data.
        failure = True
    with factory.begin() as db:
        job = db.scalar(select(OutboxJob).where(OutboxJob.id == identifier).with_for_update())
        if job.status != "leased" or job.lease_token != lease:
            return True
        job.lease_token = job.lease_until = None
        if failure:
            job.status = "dead" if job.attempt_count >= MAX_ATTEMPTS else "pending"
            job.available_at = backoff(job.attempt_count)
            job.last_error = "notification_fanout_failed"
        else:
            job.status, job.completed_at, job.last_error = "done", now(), None
    return True


def smtp_send(settings, message):
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password.get_secret_value())
        smtp.send_message(message)


def email_once(factory, settings, send=None):
    """Send one due email delivery with bounded retries. Returns False when nothing is due."""
    with factory.begin() as db:
        delivery = db.scalar(
            select(NotificationDelivery)
            .where(
                NotificationDelivery.channel == "email",
                NotificationDelivery.status == "pending",
                NotificationDelivery.next_attempt_at <= now(),
            )
            .order_by(NotificationDelivery.next_attempt_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not delivery:
            return False
        if delivery.attempt_count >= MAX_ATTEMPTS:
            delivery.status, delivery.next_attempt_at = "failed", None
            delivery.last_error = "email_delivery_failed"
            return True
        delivery.attempt_count += 1
        attempt = delivery.attempt_count
        # The lease is a short retry time: if this worker dies, the row is simply due again.
        delivery.next_attempt_at = now() + timedelta(seconds=LEASE_SECONDS)
        identifier, notification_id = delivery.id, delivery.notification_id
    outcome, message_id = "retry", None
    try:
        with factory() as db:
            notification = db.get(Notification, notification_id)
            user = db.get(User, notification.recipient_user_id)
            if not user or user.status != "active" or user.email_verified_at is None:
                outcome = "unavailable"
            else:
                subject, body = render(
                    settings, notification.kind, notification.locale, notification.safe_payload
                )
                message_id = f"<notification-{identifier}@biletflow.local>"
                message = EmailMessage()
                message["From"], message["To"] = settings.email_from, user.email
                message["Subject"], message["Message-ID"] = subject, message_id
                message.set_content(body)
                outcome = "send"
        if outcome == "send":
            (send or (lambda m: smtp_send(settings, m)))(message)
            outcome = "sent"
    except Exception:
        outcome = "retry"
    with factory.begin() as db:
        delivery = db.scalar(
            select(NotificationDelivery)
            .where(NotificationDelivery.id == identifier)
            .with_for_update()
        )
        if delivery.status != "pending" or delivery.attempt_count != attempt:
            return True
        if outcome == "sent":
            delivery.status, delivery.sent_at = "sent", now()
            delivery.next_attempt_at, delivery.last_error = None, None
            delivery.provider_message_id = message_id
        elif outcome == "unavailable":
            delivery.status, delivery.next_attempt_at = "failed", None
            delivery.last_error = "recipient_unavailable"
        else:
            delivery.last_error = "email_delivery_failed"
            if attempt >= MAX_ATTEMPTS:
                delivery.status, delivery.next_attempt_at = "failed", None
            else:
                delivery.next_attempt_at = backoff(attempt)
    return True


def deliver_notifications_once(factory, settings, send=None):
    first = fanout_once(factory)
    second = email_once(factory, settings, send)
    return first or second


def unread_count(db, user_id):
    return db.scalar(
        select(func.count(Notification.id)).where(
            Notification.recipient_user_id == user_id, Notification.read_at.is_(None)
        )
    )


def mark_read(db, user_id, notification_id=None):
    query = update(Notification).where(
        Notification.recipient_user_id == user_id, Notification.read_at.is_(None)
    )
    if notification_id:
        query = query.where(Notification.id == notification_id)
    return db.execute(query.values(read_at=now())).rowcount
