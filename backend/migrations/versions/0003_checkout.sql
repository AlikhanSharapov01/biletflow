-- Stage C: checkout confirmation, orders and issued tickets (free-checkout scope).
-- fulfillment_payment_attempt_id and pdf_file_id are kept as plain UUID columns
-- without a foreign key: payment_attempt and stored_file belong to later stages.

CREATE TABLE biletflow.ticket_order (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	event_id UUID NOT NULL,
	buyer_user_id UUID NOT NULL,
	hold_id UUID NOT NULL,
	status TEXT DEFAULT 'pending' NOT NULL,
	currency TEXT DEFAULT 'KZT' NOT NULL,
	gross_minor BIGINT NOT NULL,
	discount_minor BIGINT DEFAULT 0 NOT NULL,
	payable_minor BIGINT NOT NULL,
	processing_fee_minor BIGINT DEFAULT 0 NOT NULL,
	processing_rate_bps INTEGER DEFAULT 300 NOT NULL,
	policy_snapshot JSONB NOT NULL,
	event_snapshot JSONB NOT NULL,
	quote_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	confirmed_at TIMESTAMP WITH TIME ZONE,
	fulfillment_payment_attempt_id UUID,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ticket_order_uq1 UNIQUE (hold_id),
	CONSTRAINT ticket_order_uq2 UNIQUE (fulfillment_payment_attempt_id),
	CONSTRAINT ticket_order_uq3 UNIQUE (id, event_id),
	CONSTRAINT ticket_order_uq4 UNIQUE (id, event_id, hold_id),
	CONSTRAINT ticket_order_ck1 CHECK (status IN ('pending','confirmed','failed','expired','cancelled','refund_pending','refunded')),
	CONSTRAINT ticket_order_ck2 CHECK (currency = 'KZT'),
	CONSTRAINT ticket_order_ck3 CHECK (gross_minor >= 0 AND discount_minor BETWEEN 0 AND gross_minor),
	CONSTRAINT ticket_order_ck4 CHECK (payable_minor = gross_minor - discount_minor),
	CONSTRAINT ticket_order_ck5 CHECK (processing_fee_minor BETWEEN 0 AND payable_minor),
	CONSTRAINT ticket_order_ck6 CHECK (processing_rate_bps BETWEEN 0 AND 10000),
	CONSTRAINT ticket_order_ck7 CHECK (jsonb_typeof(policy_snapshot) = 'object' AND jsonb_typeof(event_snapshot) = 'object'),
	CONSTRAINT ticket_order_ck8 CHECK (status NOT IN ('confirmed','refund_pending','refunded') OR confirmed_at IS NOT NULL),
	CONSTRAINT ticket_order_ck9 CHECK (confirmed_at IS NULL OR ((payable_minor = 0 AND fulfillment_payment_attempt_id IS NULL) OR (payable_minor > 0 AND fulfillment_payment_attempt_id IS NOT NULL)))
)

;


ALTER TABLE biletflow.ticket_order ADD CONSTRAINT fk_ticket_order_020 FOREIGN KEY (hold_id, event_id, buyer_user_id) REFERENCES biletflow.checkout_hold (id, event_id, buyer_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT;


CREATE TABLE biletflow.order_item (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	order_id UUID NOT NULL,
	event_id UUID NOT NULL,
	hold_id UUID NOT NULL,
	ticket_type_id UUID NOT NULL,
	allocation_id UUID NOT NULL,
	unit_number INTEGER NOT NULL,
	ticket_type_name TEXT NOT NULL,
	recipient_name TEXT NOT NULL,
	recipient_email TEXT NOT NULL,
	face_value_minor BIGINT NOT NULL,
	discount_minor BIGINT DEFAULT 0 NOT NULL,
	paid_minor BIGINT NOT NULL,
	processing_fee_minor BIGINT DEFAULT 0 NOT NULL,
	seat_snapshot JSONB,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT order_item_uq1 UNIQUE (allocation_id),
	CONSTRAINT order_item_uq2 UNIQUE (order_id, unit_number),
	CONSTRAINT order_item_uq3 UNIQUE (id, event_id),
	CONSTRAINT order_item_ck1 CHECK (unit_number > 0),
	CONSTRAINT order_item_ck2 CHECK (recipient_email = lower(btrim(recipient_email))),
	CONSTRAINT order_item_ck3 CHECK (face_value_minor >= 0 AND discount_minor BETWEEN 0 AND face_value_minor),
	CONSTRAINT order_item_ck4 CHECK (paid_minor = face_value_minor - discount_minor),
	CONSTRAINT order_item_ck5 CHECK (processing_fee_minor BETWEEN 0 AND paid_minor),
	CONSTRAINT order_item_ck6 CHECK (seat_snapshot IS NULL OR jsonb_typeof(seat_snapshot) = 'object')
)

;


ALTER TABLE biletflow.order_item ADD CONSTRAINT fk_order_item_022 FOREIGN KEY (order_id, event_id, hold_id) REFERENCES biletflow.ticket_order (id, event_id, hold_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE biletflow.order_item ADD CONSTRAINT fk_order_item_023 FOREIGN KEY (allocation_id, event_id, hold_id, ticket_type_id) REFERENCES biletflow.inventory_allocation (id, event_id, hold_id, ticket_type_id) ON DELETE RESTRICT ON UPDATE RESTRICT;


CREATE TABLE biletflow.ticket (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	event_id UUID NOT NULL,
	order_item_id UUID NOT NULL,
	recipient_user_id UUID,
	status TEXT DEFAULT 'valid' NOT NULL,
	qr_token_hash TEXT NOT NULL,
	token_version INTEGER DEFAULT 1 NOT NULL,
	claimed_at TIMESTAMP WITH TIME ZONE,
	issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	pdf_file_id UUID,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ticket_uq1 UNIQUE (order_item_id),
	CONSTRAINT ticket_uq2 UNIQUE (qr_token_hash),
	CONSTRAINT ticket_uq3 UNIQUE (id, event_id),
	CONSTRAINT ticket_ck1 CHECK (status IN ('valid','checked_in','refund_pending','refunded','cancelled')),
	CONSTRAINT ticket_ck2 CHECK (token_version > 0),
	CONSTRAINT ticket_ck3 CHECK ((recipient_user_id IS NULL) = (claimed_at IS NULL))
)

;


ALTER TABLE biletflow.ticket ADD CONSTRAINT fk_ticket_041 FOREIGN KEY (order_item_id, event_id) REFERENCES biletflow.order_item (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE biletflow.ticket ADD CONSTRAINT fk_ticket_101 FOREIGN KEY (recipient_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- FK lookups on hold_id, allocation_id and order_item_id reuse their unique constraints.
CREATE INDEX ix_buyer_orders ON biletflow.ticket_order (buyer_user_id, created_at);
CREATE INDEX ix_event_sales ON biletflow.ticket_order (event_id, confirmed_at) WHERE confirmed_at IS NOT NULL;
CREATE INDEX ix_ticket_recipient ON biletflow.ticket (recipient_user_id);
CREATE INDEX ix_issued_ticket_event ON biletflow.ticket (event_id, issued_at);
CREATE INDEX ix_order_item_recipient ON biletflow.order_item (recipient_email);