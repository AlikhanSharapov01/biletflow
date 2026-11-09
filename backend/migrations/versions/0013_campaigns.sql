-- SRS 4.14: promo campaigns, event-scoped codes, reservations and immutable redemptions.
-- Adapted from docs/database/BiletFlow_PostgreSQL_Schema.sql: a code is unique per event and
-- max_redemptions may be NULL for an unlimited campaign.

CREATE TABLE biletflow.campaign (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	event_id UUID NOT NULL,
	name TEXT NOT NULL,
	discount_kind TEXT NOT NULL,
	percentage_bps INTEGER,
	fixed_minor BIGINT,
	starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
	ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
	max_redemptions INTEGER,
	is_enabled BOOLEAN DEFAULT true NOT NULL,
	all_ticket_types BOOLEAN DEFAULT true NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT campaign_uq1 UNIQUE (id, event_id),
	CONSTRAINT campaign_ck1 CHECK ((discount_kind = 'percentage' AND percentage_bps BETWEEN 1 AND 10000 AND fixed_minor IS NULL) OR (discount_kind = 'fixed' AND fixed_minor > 0 AND percentage_bps IS NULL)),
	CONSTRAINT campaign_ck2 CHECK (ends_at > starts_at AND (max_redemptions IS NULL OR max_redemptions > 0)),
	CONSTRAINT fk_campaign_event FOREIGN KEY (event_id) REFERENCES biletflow.event (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.campaign_ticket_type (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	event_id UUID NOT NULL,
	campaign_id UUID NOT NULL,
	ticket_type_id UUID NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT campaign_ticket_type_uq1 UNIQUE (campaign_id, ticket_type_id),
	CONSTRAINT fk_campaign_ticket_type_campaign FOREIGN KEY (campaign_id, event_id) REFERENCES biletflow.campaign (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_campaign_ticket_type_type FOREIGN KEY (ticket_type_id, event_id) REFERENCES biletflow.ticket_type (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.promo_code (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	event_id UUID NOT NULL,
	campaign_id UUID NOT NULL,
	code_normalized TEXT NOT NULL,
	link_token_hash TEXT NOT NULL,
	is_enabled BOOLEAN DEFAULT true NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT promo_code_uq1 UNIQUE (event_id, code_normalized),
	CONSTRAINT promo_code_uq2 UNIQUE (link_token_hash),
	CONSTRAINT promo_code_uq3 UNIQUE (id, event_id, campaign_id),
	CONSTRAINT promo_code_uq4 UNIQUE (campaign_id),
	CONSTRAINT promo_code_ck1 CHECK (code_normalized = upper(btrim(code_normalized))),
	CONSTRAINT fk_promo_code_campaign FOREIGN KEY (campaign_id, event_id) REFERENCES biletflow.campaign (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.promo_reservation (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	event_id UUID NOT NULL,
	campaign_id UUID NOT NULL,
	promo_code_id UUID NOT NULL,
	hold_id UUID NOT NULL,
	status TEXT DEFAULT 'active' NOT NULL,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	discount_snapshot JSONB NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT promo_reservation_uq1 UNIQUE (id, event_id, campaign_id),
	CONSTRAINT promo_reservation_ck1 CHECK (status IN ('active','consumed','released')),
	CONSTRAINT promo_reservation_ck2 CHECK (expires_at > created_at),
	CONSTRAINT promo_reservation_ck3 CHECK (jsonb_typeof(discount_snapshot) = 'object'),
	CONSTRAINT fk_promo_reservation_campaign FOREIGN KEY (campaign_id, event_id) REFERENCES biletflow.campaign (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_promo_reservation_code FOREIGN KEY (promo_code_id, event_id, campaign_id) REFERENCES biletflow.promo_code (id, event_id, campaign_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_promo_reservation_hold FOREIGN KEY (hold_id, event_id) REFERENCES biletflow.checkout_hold (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.promo_redemption (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	event_id UUID NOT NULL,
	campaign_id UUID NOT NULL,
	reservation_id UUID NOT NULL,
	order_id UUID NOT NULL,
	discount_minor BIGINT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT promo_redemption_uq1 UNIQUE (order_id),
	CONSTRAINT promo_redemption_uq2 UNIQUE (reservation_id),
	CONSTRAINT promo_redemption_ck1 CHECK (discount_minor >= 0),
	CONSTRAINT fk_promo_redemption_campaign FOREIGN KEY (campaign_id, event_id) REFERENCES biletflow.campaign (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_promo_redemption_reservation FOREIGN KEY (reservation_id, event_id, campaign_id) REFERENCES biletflow.promo_reservation (id, event_id, campaign_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_promo_redemption_order FOREIGN KEY (order_id, event_id) REFERENCES biletflow.ticket_order (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

ALTER TABLE biletflow.ticket_order ADD COLUMN campaign_id UUID;
ALTER TABLE biletflow.ticket_order ADD COLUMN promo_code_id UUID;
ALTER TABLE biletflow.ticket_order ADD CONSTRAINT ticket_order_ck10 CHECK ((campaign_id IS NULL) = (promo_code_id IS NULL));
ALTER TABLE biletflow.ticket_order ADD CONSTRAINT fk_ticket_order_campaign FOREIGN KEY (campaign_id, event_id) REFERENCES biletflow.campaign (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE biletflow.ticket_order ADD CONSTRAINT fk_ticket_order_promo_code FOREIGN KEY (promo_code_id, event_id, campaign_id) REFERENCES biletflow.promo_code (id, event_id, campaign_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE biletflow.order_item ADD COLUMN campaign_eligible BOOLEAN;

CREATE UNIQUE INDEX uq_active_promo_hold ON biletflow.promo_reservation (hold_id) WHERE status = 'active';
CREATE INDEX ix_promo_reservation_campaign ON biletflow.promo_reservation (campaign_id, status);
CREATE INDEX ix_promo_redemption_campaign ON biletflow.promo_redemption (campaign_id);
CREATE INDEX ix_campaign_event ON biletflow.campaign (event_id, created_at);
CREATE INDEX ix_ticket_order_campaign ON biletflow.ticket_order (campaign_id) WHERE campaign_id IS NOT NULL;

-- A redemption is attribution history: a refund never rewrites or removes it.
CREATE TRIGGER immutable_promo_redemption BEFORE UPDATE OR DELETE ON biletflow.promo_redemption
FOR EACH ROW EXECUTE FUNCTION biletflow.reject_auth_history_change();
