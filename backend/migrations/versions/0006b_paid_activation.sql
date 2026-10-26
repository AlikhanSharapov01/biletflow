-- Commerce package B2: per-event paid-sales activation and the simulated payment boundary
-- shared with paid orders (B3). Everything financial here is a SIMULATION: no card data,
-- no real money and no production identity verification. Tables follow docs/database.

CREATE TABLE biletflow.payout_profile (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	organization_id UUID NOT NULL,
	environment TEXT DEFAULT 'simulation' NOT NULL,
	provider TEXT NOT NULL,
	provider_reference TEXT,
	encrypted_details BYTEA,
	status TEXT DEFAULT 'pending' NOT NULL,
	verified_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT payout_profile_uq1 UNIQUE (id, organization_id),
	CONSTRAINT payout_profile_ck1 CHECK (environment IN ('simulation','sandbox')),
	CONSTRAINT payout_profile_ck2 CHECK (status IN ('pending','verified','rejected')),
	CONSTRAINT payout_profile_ck3 CHECK (status <> 'verified' OR verified_at IS NOT NULL),
	CONSTRAINT fk_payout_profile_org FOREIGN KEY (organization_id) REFERENCES biletflow.organization (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.verification_record (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	organization_id UUID NOT NULL,
	submitted_by_user_id UUID NOT NULL,
	reviewed_by_user_id UUID,
	environment TEXT DEFAULT 'simulation' NOT NULL,
	status TEXT DEFAULT 'pending' NOT NULL,
	reviewed_at TIMESTAMP WITH TIME ZONE,
	reason TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT verification_record_uq1 UNIQUE (id, organization_id),
	CONSTRAINT verification_record_ck1 CHECK (environment IN ('simulation','sandbox')),
	CONSTRAINT verification_record_ck2 CHECK (status IN ('pending','approved','rejected')),
	CONSTRAINT verification_record_ck3 CHECK (status = 'pending' OR reviewed_at IS NOT NULL),
	CONSTRAINT fk_verification_record_org FOREIGN KEY (organization_id) REFERENCES biletflow.organization (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_verification_record_submitter FOREIGN KEY (submitted_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_verification_record_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.terms_acceptance (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	event_id UUID NOT NULL,
	accepted_by_user_id UUID NOT NULL,
	terms_version TEXT NOT NULL,
	terms_hash TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT terms_acceptance_uq1 UNIQUE (event_id, terms_version, accepted_by_user_id),
	CONSTRAINT terms_acceptance_uq2 UNIQUE (id, event_id),
	CONSTRAINT fk_terms_acceptance_event FOREIGN KEY (event_id) REFERENCES biletflow.event (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_terms_acceptance_user FOREIGN KEY (accepted_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.sales_activation (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	event_id UUID NOT NULL,
	organization_id UUID NOT NULL,
	payout_profile_id UUID,
	verification_record_id UUID,
	terms_acceptance_id UUID,
	status TEXT DEFAULT 'incomplete' NOT NULL,
	activation_fee_minor BIGINT DEFAULT 500000 NOT NULL,
	currency TEXT DEFAULT 'KZT' NOT NULL,
	paid_attempt_id UUID,
	activated_at TIMESTAMP WITH TIME ZONE,
	suspension_reason TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT sales_activation_uq1 UNIQUE (event_id),
	CONSTRAINT sales_activation_uq2 UNIQUE (paid_attempt_id),
	CONSTRAINT sales_activation_uq3 UNIQUE (id, event_id),
	CONSTRAINT sales_activation_ck1 CHECK (status IN ('incomplete','pending','active','failed','suspended')),
	CONSTRAINT sales_activation_ck2 CHECK (activation_fee_minor > 0 AND currency = 'KZT'),
	CONSTRAINT sales_activation_ck3 CHECK (status <> 'active' OR (payout_profile_id IS NOT NULL AND verification_record_id IS NOT NULL AND terms_acceptance_id IS NOT NULL AND paid_attempt_id IS NOT NULL AND activated_at IS NOT NULL)),
	CONSTRAINT sales_activation_ck4 CHECK (status <> 'suspended' OR suspension_reason IS NOT NULL),
	CONSTRAINT fk_sales_activation_event FOREIGN KEY (event_id, organization_id) REFERENCES biletflow.event (id, organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_sales_activation_payout FOREIGN KEY (payout_profile_id, organization_id) REFERENCES biletflow.payout_profile (id, organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_sales_activation_verification FOREIGN KEY (verification_record_id, organization_id) REFERENCES biletflow.verification_record (id, organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_sales_activation_terms FOREIGN KEY (terms_acceptance_id, event_id) REFERENCES biletflow.terms_acceptance (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.payment_intent (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	event_id UUID NOT NULL,
	order_id UUID,
	activation_id UUID,
	payer_user_id UUID NOT NULL,
	purpose TEXT NOT NULL,
	expected_minor BIGINT NOT NULL,
	currency TEXT DEFAULT 'KZT' NOT NULL,
	environment TEXT DEFAULT 'simulation' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT payment_intent_uq1 UNIQUE (order_id),
	CONSTRAINT payment_intent_uq2 UNIQUE (activation_id),
	CONSTRAINT payment_intent_uq3 UNIQUE (id, event_id, environment),
	CONSTRAINT payment_intent_ck1 CHECK ((purpose = 'ticket_order' AND order_id IS NOT NULL AND activation_id IS NULL) OR (purpose = 'activation' AND activation_id IS NOT NULL AND order_id IS NULL)),
	CONSTRAINT payment_intent_ck2 CHECK (expected_minor > 0),
	CONSTRAINT payment_intent_ck3 CHECK (currency = 'KZT'),
	CONSTRAINT payment_intent_ck4 CHECK (environment IN ('simulation','sandbox')),
	CONSTRAINT fk_payment_intent_event FOREIGN KEY (event_id) REFERENCES biletflow.event (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_payment_intent_order FOREIGN KEY (order_id, event_id) REFERENCES biletflow.ticket_order (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_payment_intent_activation FOREIGN KEY (activation_id, event_id) REFERENCES biletflow.sales_activation (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_payment_intent_payer FOREIGN KEY (payer_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.payment_attempt (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	intent_id UUID NOT NULL,
	event_id UUID NOT NULL,
	environment TEXT NOT NULL,
	provider TEXT NOT NULL,
	merchant_account_key TEXT NOT NULL,
	provider_payment_id TEXT,
	request_key TEXT NOT NULL,
	status TEXT DEFAULT 'created' NOT NULL,
	charged_minor BIGINT DEFAULT 0 NOT NULL,
	processing_fee_minor BIGINT DEFAULT 0 NOT NULL,
	confirmed_at TIMESTAMP WITH TIME ZONE,
	next_reconcile_at TIMESTAMP WITH TIME ZONE,
	safe_result JSONB DEFAULT '{}'::jsonb NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT payment_attempt_uq1 UNIQUE (provider, environment, merchant_account_key, provider_payment_id),
	CONSTRAINT payment_attempt_uq2 UNIQUE (provider, environment, merchant_account_key, request_key),
	CONSTRAINT payment_attempt_uq3 UNIQUE (id, event_id),
	CONSTRAINT payment_attempt_ck1 CHECK (status IN ('created','pending','succeeded','failed')),
	CONSTRAINT payment_attempt_ck2 CHECK (charged_minor >= 0 AND processing_fee_minor BETWEEN 0 AND charged_minor),
	CONSTRAINT payment_attempt_ck3 CHECK ((status = 'succeeded') = (confirmed_at IS NOT NULL)),
	CONSTRAINT payment_attempt_ck4 CHECK (status <> 'succeeded' OR charged_minor > 0),
	CONSTRAINT payment_attempt_ck5 CHECK (jsonb_typeof(safe_result) = 'object'),
	CONSTRAINT fk_payment_attempt_intent FOREIGN KEY (intent_id, event_id, environment) REFERENCES biletflow.payment_intent (id, event_id, environment) ON DELETE RESTRICT ON UPDATE RESTRICT
);

ALTER TABLE biletflow.sales_activation ADD CONSTRAINT fk_sales_activation_paid_attempt FOREIGN KEY (paid_attempt_id, event_id) REFERENCES biletflow.payment_attempt (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE biletflow.provider_event (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	provider TEXT NOT NULL,
	environment TEXT NOT NULL,
	merchant_account_key TEXT NOT NULL,
	external_event_id TEXT NOT NULL,
	payment_attempt_id UUID,
	refund_attempt_id UUID,
	payload_hash TEXT NOT NULL,
	safe_payload JSONB NOT NULL,
	status TEXT DEFAULT 'received' NOT NULL,
	processed_at TIMESTAMP WITH TIME ZONE,
	rejection_reason TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT provider_event_uq1 UNIQUE (provider, environment, merchant_account_key, external_event_id),
	CONSTRAINT provider_event_ck1 CHECK (environment IN ('simulation','sandbox')),
	CONSTRAINT provider_event_ck2 CHECK (status IN ('received','processed','rejected')),
	CONSTRAINT provider_event_ck3 CHECK (num_nonnulls(payment_attempt_id, refund_attempt_id) <= 1),
	CONSTRAINT provider_event_ck4 CHECK (jsonb_typeof(safe_payload) = 'object'),
	CONSTRAINT provider_event_ck5 CHECK (status <> 'processed' OR processed_at IS NOT NULL),
	CONSTRAINT fk_provider_event_payment FOREIGN KEY (payment_attempt_id) REFERENCES biletflow.payment_attempt (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX ix_payment_attempt_intent ON biletflow.payment_attempt (intent_id, created_at);
CREATE INDEX ix_provider_event_attempt ON biletflow.provider_event (payment_attempt_id);
