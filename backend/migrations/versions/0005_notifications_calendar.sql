-- BF-15 notifications. Calendar export (BF-17) needs no schema: it reads the existing
-- event.calendar_uid / calendar_sequence columns.

CREATE TABLE biletflow.notification (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	recipient_user_id UUID NOT NULL,
	event_id UUID,
	kind TEXT NOT NULL,
	locale TEXT NOT NULL,
	deduplication_key TEXT NOT NULL,
	safe_payload JSONB NOT NULL,
	read_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT notification_uq1 UNIQUE (recipient_user_id, deduplication_key),
	CONSTRAINT notification_ck1 CHECK (locale IN ('kk','ru','en')),
	CONSTRAINT notification_ck2 CHECK (jsonb_typeof(safe_payload) = 'object'),
	CONSTRAINT fk_notification_117 FOREIGN KEY (recipient_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_notification_118 FOREIGN KEY (event_id) REFERENCES biletflow.event (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX ix_inbox ON biletflow.notification (recipient_user_id, created_at, id);

CREATE TABLE biletflow.notification_delivery (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	notification_id UUID NOT NULL,
	channel TEXT NOT NULL,
	status TEXT DEFAULT 'pending' NOT NULL,
	attempt_count INTEGER DEFAULT 0 NOT NULL,
	next_attempt_at TIMESTAMP WITH TIME ZONE,
	provider_message_id TEXT,
	sent_at TIMESTAMP WITH TIME ZONE,
	last_error TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT notification_delivery_uq1 UNIQUE (notification_id, channel),
	CONSTRAINT notification_delivery_ck1 CHECK (channel IN ('email','in_app')),
	CONSTRAINT notification_delivery_ck2 CHECK (status IN ('pending','sent','failed')),
	CONSTRAINT notification_delivery_ck3 CHECK (attempt_count >= 0),
	CONSTRAINT notification_delivery_ck4 CHECK (status <> 'sent' OR sent_at IS NOT NULL),
	CONSTRAINT fk_notification_delivery_069 FOREIGN KEY (notification_id) REFERENCES biletflow.notification (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX ix_delivery_ready ON biletflow.notification_delivery (next_attempt_at) WHERE status = 'pending';
