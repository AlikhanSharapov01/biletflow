-- Commerce package B3: simulated paid orders and the compensation refund path.
-- Adds the refund obligation/attempt tables and the foreign keys deferred since 0003/0011.

CREATE TABLE biletflow.refund (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	payment_attempt_id UUID NOT NULL,
	event_id UUID NOT NULL,
	reason TEXT NOT NULL,
	status TEXT DEFAULT 'requested' NOT NULL,
	amount_minor BIGINT NOT NULL,
	requested_by_user_id UUID,
	approved_by_user_id UUID,
	succeeded_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT refund_uq1 UNIQUE (payment_attempt_id),
	CONSTRAINT refund_uq2 UNIQUE (id, event_id),
	CONSTRAINT refund_ck1 CHECK (reason IN ('voluntary','event_cancelled','late_payment','duplicate_charge','blocked_fulfillment')),
	CONSTRAINT refund_ck2 CHECK (status IN ('requested','pending','failed','succeeded')),
	CONSTRAINT refund_ck3 CHECK (amount_minor > 0),
	CONSTRAINT refund_ck4 CHECK ((status = 'succeeded') = (succeeded_at IS NOT NULL)),
	CONSTRAINT fk_refund_payment FOREIGN KEY (payment_attempt_id, event_id) REFERENCES biletflow.payment_attempt (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_refund_requested_by FOREIGN KEY (requested_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_refund_approved_by FOREIGN KEY (approved_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.refund_attempt (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	refund_id UUID NOT NULL,
	attempt_number INTEGER NOT NULL,
	provider_refund_id TEXT,
	provider_request_key TEXT NOT NULL,
	status TEXT DEFAULT 'pending' NOT NULL,
	sent_at TIMESTAMP WITH TIME ZONE,
	resolved_at TIMESTAMP WITH TIME ZONE,
	safe_result JSONB DEFAULT '{}'::jsonb NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT refund_attempt_uq1 UNIQUE (refund_id, attempt_number),
	CONSTRAINT refund_attempt_uq2 UNIQUE (provider_request_key),
	CONSTRAINT refund_attempt_ck1 CHECK (attempt_number > 0),
	CONSTRAINT refund_attempt_ck2 CHECK (status IN ('pending','succeeded','failed','unknown')),
	CONSTRAINT refund_attempt_ck3 CHECK (jsonb_typeof(safe_result) = 'object'),
	CONSTRAINT fk_refund_attempt_refund FOREIGN KEY (refund_id) REFERENCES biletflow.refund (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

ALTER TABLE biletflow.provider_event ADD CONSTRAINT fk_provider_event_refund FOREIGN KEY (refund_attempt_id) REFERENCES biletflow.refund_attempt (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE biletflow.ticket_order ADD CONSTRAINT fk_ticket_order_fulfillment FOREIGN KEY (fulfillment_payment_attempt_id, event_id) REFERENCES biletflow.payment_attempt (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX ix_refund_status ON biletflow.refund (status, created_at);
CREATE INDEX ix_provider_event_refund ON biletflow.provider_event (refund_attempt_id);
