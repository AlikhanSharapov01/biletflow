-- Commerce package B1 (Part B migrations start at 0010): completed request outcomes for Idempotency-Key handling.
-- A row is inserted in the same transaction as the result it names; there are no
-- pending placeholders. Expired rows are reused in place, so no DELETE grant is needed.

CREATE TABLE biletflow.idempotency_record (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	actor_user_id UUID NOT NULL,
	operation TEXT NOT NULL,
	request_key TEXT NOT NULL,
	request_hash TEXT NOT NULL,
	resource_type TEXT NOT NULL,
	resource_id UUID NOT NULL,
	response_code INTEGER NOT NULL,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT idempotency_record_uq1 UNIQUE (actor_user_id, operation, request_key),
	CONSTRAINT idempotency_record_ck1 CHECK (response_code BETWEEN 200 AND 299),
	CONSTRAINT idempotency_record_ck2 CHECK (expires_at > created_at),
	CONSTRAINT idempotency_record_ck3 CHECK (char_length(request_key) BETWEEN 8 AND 128),
	CONSTRAINT fk_idempotency_record_actor FOREIGN KEY (actor_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Background expiry scans active holds by deadline across all events.
CREATE INDEX ix_hold_expiry ON biletflow.checkout_hold (expires_at) WHERE status = 'active';
