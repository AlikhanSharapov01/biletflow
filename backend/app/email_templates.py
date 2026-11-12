"""Transactional email copy; recipient values are interpolated without translation."""

from .notification_service import resolve_locale

COPY = {
    "verify": {
        "en": "Verify your BiletFlow email",
        "ru": "Подтвердите почту BiletFlow",
        "kk": "BiletFlow поштаңызды растаңыз",
    },
    "reset": {
        "en": "Reset your BiletFlow password",
        "ru": "Сбросьте пароль BiletFlow",
        "kk": "BiletFlow құпиясөзін қалпына келтіріңіз",
    },
    "expires": {"en": "Expires", "ru": "Срок действия", "kk": "Жарамдылық мерзімі"},
    "ignore": {
        "en": "If you did not request this, ignore this email.",
        "ru": "Если вы не отправляли запрос, проигнорируйте это письмо.",
        "kk": "Бұл сұрауды жібермесеңіз, осы хатты елемеңіз.",
    },
    "invitation_subject": {
        "en": "BiletFlow organizer invitation",
        "ru": "Приглашение организатора BiletFlow",
        "kk": "BiletFlow ұйымдастырушысының шақыруы",
    },
    "invitation": {
        "en": "You are invited to join {organization}. Sign in with this email to accept.",
        "ru": "Вас приглашают в {organization}. Для принятия войдите с этой почтой.",
        "kk": "Сізді {organization} ұйымына шақырады. Қабылдау үшін осы поштамен кіріңіз.",
    },
    "case_opened": {
        "en": "New support case",
        "ru": "Новое обращение в поддержку",
        "kk": "Жаңа қолдау өтініші",
    },
    "message": {
        "en": "New message on a support case",
        "ru": "Новое сообщение по обращению",
        "kk": "Қолдау өтінішінде жаңа хабарлама",
    },
    "status": {
        "en": "Support case status changed",
        "ru": "Статус обращения изменён",
        "kk": "Қолдау өтінішінің мәртебесі өзгерді",
    },
    "assignment": {
        "en": "Support case assignment changed",
        "ru": "Назначение обращения изменено",
        "kk": "Қолдау өтінішінің жауапты қызметкері өзгерді",
    },
    "escalation": {
        "en": "Support case escalated to the platform",
        "ru": "Обращение передано платформе",
        "kk": "Қолдау өтініші платформаға жіберілді",
    },
    "support_update": {
        "en": "Support case update",
        "ru": "Обновление обращения",
        "kk": "Қолдау өтініші жаңартылды",
    },
    "sign_in": {
        "en": "Sign in to read it",
        "ru": "Войдите, чтобы прочитать",
        "kk": "Оқу үшін жүйеге кіріңіз",
    },
    "hello": {"en": "Hello {name},", "ru": "Здравствуйте, {name}!", "kk": "Сәлеметсіз бе, {name}!"},
    "ticket_subject": {
        "en": "Your BiletFlow ticket: {title}",
        "ru": "Ваш билет BiletFlow: {title}",
        "kk": "BiletFlow билетіңіз: {title}",
    },
    "ticket_confirmed": {
        "en": "Your ticket for {title} is confirmed.",
        "ru": "Ваш билет на {title} подтверждён.",
        "kk": "{title} іс-шарасына билетіңіз расталды.",
    },
    "when": {"en": "When", "ru": "Время", "kk": "Уақыты"},
    "venue": {"en": "Venue", "ru": "Место проведения", "kk": "Өтетін орны"},
    "ticket_type": {"en": "Ticket type", "ru": "Тип билета", "kk": "Билет түрі"},
    "seat": {
        "en": "Seat: section {section}, row {row}, seat {seat}",
        "ru": "Место: сектор {section}, ряд {row}, место {seat}",
        "kk": "Орын: {section} сектор, {row} қатар, {seat} орын",
    },
    "ticket_id": {"en": "Ticket ID", "ru": "ID билета", "kk": "Билет ID"},
    "ticket_sign_in": {
        "en": "Sign in with {email} to view your QR code:",
        "ru": "Войдите с почтой {email}, чтобы увидеть QR-код:",
        "kk": "QR кодын көру үшін {email} поштасымен кіріңіз:",
    },
    "attachment": {
        "en": "Your printable ticket is attached (A4, grayscale-safe).",
        "ru": "Билет для печати прикреплён (A4, подходит для чёрно-белой печати).",
        "kk": "Басып шығаруға арналған билет тіркелген (A4, ақ-қара баспаға жарамды).",
    },
}


def copy(key, locale, **values):
    return COPY[key][resolve_locale(locale)].format(**values)
