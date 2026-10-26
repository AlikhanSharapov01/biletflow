-- Stage D, second increment: signed-in attendee entry confirmation (BF-11), scanner device
-- registration and offline package/sync records (BF-12). Deviations from the long-term
-- specification: no stored_file (the package manifest is regenerated, only its hash is kept),
-- and the two composite parent keys that would need new unique indexes on ticket and
-- auth_session are plain foreign keys here, with the equality checked in the service.

CREATE TABLE biletflow.entry_confirmation (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	ticket_id UUID NOT NULL,
	event_id UUID NOT NULL,
	attendee_user_id UUID NOT NULL,
	session_id UUID NOT NULL,
	token_hash TEXT NOT NULL,
	code_hash TEXT NOT NULL,
	signing_key_id TEXT NOT NULL,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	consumed_at TIMESTAMP WITH TIME ZONE,
	revoked_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT entry_confirmation_uq1 UNIQUE (token_hash),
	CONSTRAINT entry_confirmation_uq2 UNIQUE (id, ticket_id, event_id),
	CONSTRAINT entry_confirmation_ck1 CHECK (expires_at > created_at),
	CONSTRAINT fk_entry_confirmation_ticket FOREIGN KEY (ticket_id, event_id) REFERENCES biletflow.ticket (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_entry_confirmation_attendee FOREIGN KEY (attendee_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_entry_confirmation_session FOREIGN KEY (session_id) REFERENCES biletflow.auth_session (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX ix_entry_confirmation_ticket ON biletflow.entry_confirmation (ticket_id, created_at);
-- At most one live (unused, not revoked) confirmation per ticket; issuing a new one revokes the old.
CREATE UNIQUE INDEX uq_live_entry_confirmation ON biletflow.entry_confirmation (ticket_id) WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE TABLE biletflow.scanner_device (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	owner_user_id UUID NOT NULL,
	device_key TEXT NOT NULL,
	label TEXT NOT NULL,
	revoked_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT scanner_device_uq1 UNIQUE (device_key),
	CONSTRAINT scanner_device_uq2 UNIQUE (id, owner_user_id),
	CONSTRAINT scanner_device_ck1 CHECK (length(btrim(label)) > 0),
	CONSTRAINT fk_scanner_device_owner FOREIGN KEY (owner_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

ALTER TABLE biletflow.check_in
	ADD CONSTRAINT fk_check_in_confirmation FOREIGN KEY (entry_confirmation_id, ticket_id, event_id) REFERENCES biletflow.entry_confirmation (id, ticket_id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	ADD CONSTRAINT fk_check_in_device FOREIGN KEY (device_id, scanner_user_id) REFERENCES biletflow.scanner_device (id, owner_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE biletflow.offline_package (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	event_id UUID NOT NULL,
	scanner_user_id UUID NOT NULL,
	session_id UUID NOT NULL,
	device_id UUID NOT NULL,
	snapshot_version BIGINT NOT NULL,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	content_hash TEXT NOT NULL,
	signing_key_id TEXT NOT NULL,
	revoked_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT offline_package_uq1 UNIQUE (id, event_id, device_id),
	CONSTRAINT offline_package_ck1 CHECK (snapshot_version >= 0),
	CONSTRAINT offline_package_ck2 CHECK (expires_at > created_at),
	CONSTRAINT fk_offline_package_session FOREIGN KEY (session_id) REFERENCES biletflow.auth_session (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_offline_package_device FOREIGN KEY (device_id, scanner_user_id) REFERENCES biletflow.scanner_device (id, owner_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_offline_package_event FOREIGN KEY (event_id) REFERENCES biletflow.event (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.offline_operation (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	package_id UUID NOT NULL,
	event_id UUID NOT NULL,
	device_id UUID NOT NULL,
	operation_id UUID NOT NULL,
	sequence_number BIGINT NOT NULL,
	kind TEXT NOT NULL,
	claimed_ticket_id UUID,
	claimed_confirmation_id UUID,
	parent_operation_id UUID,
	reason TEXT,
	captured_at TIMESTAMP WITH TIME ZONE NOT NULL,
	device_reported_at TIMESTAMP WITH TIME ZONE,
	payload_hash TEXT NOT NULL,
	status TEXT DEFAULT 'received' NOT NULL,
	resolved_ticket_id UUID,
	accepted_check_in_id UUID,
	rejection_code TEXT,
	processed_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT offline_operation_uq1 UNIQUE (device_id, operation_id),
	CONSTRAINT offline_operation_uq2 UNIQUE (package_id, sequence_number),
	CONSTRAINT offline_operation_ck1 CHECK (sequence_number > 0),
	CONSTRAINT offline_operation_ck2 CHECK (kind IN ('check_in','reverse')),
	CONSTRAINT offline_operation_ck3 CHECK (status IN ('received','accepted','duplicate','rejected','conflict')),
	CONSTRAINT offline_operation_ck4 CHECK ((kind = 'reverse') = (parent_operation_id IS NOT NULL)),
	CONSTRAINT offline_operation_ck5 CHECK (status = 'received' OR processed_at IS NOT NULL),
	CONSTRAINT fk_offline_operation_package FOREIGN KEY (package_id, event_id, device_id) REFERENCES biletflow.offline_package (id, event_id, device_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_offline_operation_ticket FOREIGN KEY (resolved_ticket_id, event_id) REFERENCES biletflow.ticket (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_offline_operation_check_in FOREIGN KEY (accepted_check_in_id) REFERENCES biletflow.check_in (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX ix_offline_operation_event ON biletflow.offline_operation (event_id, status, created_at);

CREATE TABLE biletflow.sync_conflict (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	offline_operation_id UUID NOT NULL,
	existing_check_in_id UUID,
	status TEXT DEFAULT 'open' NOT NULL,
	reason TEXT NOT NULL,
	resolved_by_user_id UUID,
	resolution_note TEXT,
	resolved_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT sync_conflict_uq1 UNIQUE (offline_operation_id),
	CONSTRAINT sync_conflict_ck1 CHECK (status IN ('open','resolved')),
	CONSTRAINT sync_conflict_ck2 CHECK (status <> 'resolved' OR (resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL AND resolution_note IS NOT NULL)),
	CONSTRAINT fk_sync_conflict_operation FOREIGN KEY (offline_operation_id) REFERENCES biletflow.offline_operation (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_sync_conflict_check_in FOREIGN KEY (existing_check_in_id) REFERENCES biletflow.check_in (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_sync_conflict_resolver FOREIGN KEY (resolved_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
