-- Stage D: online admission. entry_confirmation_id and device_id are kept as plain
-- UUID columns without foreign keys: attendee entry confirmation and scanner device
-- registration belong to later increments.

CREATE TABLE biletflow.check_in (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	ticket_id UUID NOT NULL,
	event_id UUID NOT NULL,
	entry_confirmation_id UUID,
	scanner_user_id UUID NOT NULL,
	scanner_session_id UUID NOT NULL,
	device_id UUID,
	operation_id UUID NOT NULL,
	source TEXT DEFAULT 'online' NOT NULL,
	accepted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	captured_at TIMESTAMP WITH TIME ZONE NOT NULL,
	reversed_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT check_in_uq1 UNIQUE (scanner_user_id, operation_id),
	CONSTRAINT check_in_uq2 UNIQUE (entry_confirmation_id),
	CONSTRAINT check_in_uq3 UNIQUE (id, ticket_id, event_id),
	CONSTRAINT check_in_ck1 CHECK (source IN ('online','offline_sync')),
	CONSTRAINT fk_check_in_ticket FOREIGN KEY (ticket_id, event_id) REFERENCES biletflow.ticket (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_check_in_scanner FOREIGN KEY (scanner_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_check_in_session FOREIGN KEY (scanner_session_id) REFERENCES biletflow.auth_session (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.check_in_reversal (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	check_in_id UUID NOT NULL,
	actor_user_id UUID NOT NULL,
	reason TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT check_in_reversal_uq1 UNIQUE (check_in_id),
	CONSTRAINT check_in_reversal_ck1 CHECK (length(btrim(reason)) > 0),
	CONSTRAINT fk_check_in_reversal_check_in FOREIGN KEY (check_in_id) REFERENCES biletflow.check_in (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_check_in_reversal_actor FOREIGN KEY (actor_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- At most one current (not reversed) admission per ticket, even under concurrent scans.
CREATE UNIQUE INDEX uq_current_check_in ON biletflow.check_in (ticket_id) WHERE reversed_at IS NULL;
CREATE INDEX ix_check_in_event ON biletflow.check_in (event_id, accepted_at);
