-- Frozen identity migration. Scope: BF-01, not the full atlas.

CREATE SCHEMA biletflow;


CREATE TABLE biletflow.app_user (
	email TEXT NOT NULL, 
	password_hash TEXT, 
	display_name TEXT NOT NULL, 
	locale TEXT DEFAULT 'ru' NOT NULL, 
	status TEXT DEFAULT 'active' NOT NULL, 
	email_verified_at TIMESTAMP WITH TIME ZONE, 
	analytics_consent BOOLEAN DEFAULT false NOT NULL, 
	consent_recorded_at TIMESTAMP WITH TIME ZONE, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT app_user_ck1 CHECK (email = lower(btrim(email)) AND position('@' in email) > 1), 
	CONSTRAINT app_user_ck2 CHECK (locale IN ('kk','ru','en')), 
	CONSTRAINT app_user_ck3 CHECK (status IN ('active','suspended')), 
	UNIQUE (email)
)

;


CREATE TABLE biletflow.auth_rate_bucket (
	key_hash TEXT NOT NULL, 
	window_start TIMESTAMP WITH TIME ZONE NOT NULL, 
	attempts INTEGER NOT NULL, 
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT auth_rate_bucket_positive CHECK (attempts > 0), 
	UNIQUE (key_hash)
)

;


CREATE TABLE biletflow.outbox_job (
	event_id UUID, 
	kind TEXT NOT NULL, 
	deduplication_key TEXT NOT NULL, 
	payload JSONB NOT NULL, 
	status TEXT DEFAULT 'pending' NOT NULL, 
	attempt_count INTEGER DEFAULT '0' NOT NULL, 
	available_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	lease_token UUID, 
	lease_until TIMESTAMP WITH TIME ZONE, 
	completed_at TIMESTAMP WITH TIME ZONE, 
	last_error TEXT, 
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT outbox_status CHECK (status IN ('pending','leased','done','dead')), 
	CONSTRAINT outbox_attempts CHECK (attempt_count >= 0), 
	CONSTRAINT outbox_object CHECK (jsonb_typeof(payload) = 'object'), 
	CONSTRAINT outbox_lease CHECK ((status = 'leased' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR (status <> 'leased' AND lease_token IS NULL AND lease_until IS NULL)), 
	CONSTRAINT outbox_completed CHECK (status <> 'done' OR completed_at IS NOT NULL), 
	CONSTRAINT auth_only_outbox_scope CHECK (event_id IS NULL), 
	UNIQUE (deduplication_key)
)

;


CREATE TABLE biletflow.account_token (
	user_id UUID NOT NULL, 
	purpose TEXT NOT NULL, 
	token_hash TEXT NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	consumed_at TIMESTAMP WITH TIME ZONE, 
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT account_token_purpose CHECK (purpose IN ('email_verify','password_reset')), 
	CONSTRAINT account_token_expiry CHECK (expires_at > created_at), 
	FOREIGN KEY(user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	UNIQUE (token_hash)
)

;

CREATE INDEX ix_biletflow_account_token_user_id ON biletflow.account_token (user_id);


CREATE TABLE biletflow.audit_log (
	event_id UUID, 
	organization_id UUID, 
	actor_user_id UUID, 
	service_actor TEXT, 
	action TEXT NOT NULL, 
	entity_type TEXT NOT NULL, 
	entity_id UUID NOT NULL, 
	description TEXT NOT NULL, 
	safe_change JSONB DEFAULT '{}'::jsonb NOT NULL, 
	correlation_id UUID NOT NULL, 
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT audit_actor CHECK (num_nonnulls(actor_user_id,service_actor) = 1), 
	CONSTRAINT audit_object CHECK (jsonb_typeof(safe_change) = 'object'), 
	CONSTRAINT audit_scope CHECK (event_id IS NULL OR organization_id IS NOT NULL), 
	CONSTRAINT auth_only_audit_scope CHECK (event_id IS NULL AND organization_id IS NULL), 
	FOREIGN KEY(actor_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;

CREATE INDEX ix_biletflow_audit_log_actor_user_id ON biletflow.audit_log (actor_user_id);


CREATE TABLE biletflow.auth_session (
	user_id UUID NOT NULL, 
	refresh_token_hash TEXT NOT NULL, 
	client_kind TEXT NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	revoked_at TIMESTAMP WITH TIME ZONE, 
	last_seen_at TIMESTAMP WITH TIME ZONE, 
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (id, user_id), 
	CONSTRAINT auth_session_client_kind CHECK (client_kind IN ('web','scanner')), 
	CONSTRAINT auth_session_expiry CHECK (expires_at > created_at), 
	FOREIGN KEY(user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	UNIQUE (refresh_token_hash)
)

;

CREATE INDEX ix_biletflow_auth_session_user_id ON biletflow.auth_session (user_id);


CREATE TABLE biletflow.external_identity (
	user_id UUID NOT NULL, 
	provider TEXT NOT NULL, 
	subject TEXT NOT NULL, 
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (provider, subject), 
	UNIQUE (user_id, provider), 
	CONSTRAINT external_identity_provider CHECK (provider = 'google'), 
	FOREIGN KEY(user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;

CREATE INDEX ix_biletflow_external_identity_user_id ON biletflow.external_identity (user_id);


CREATE TABLE biletflow.oauth_attempt (
	state_hash TEXT NOT NULL, 
	browser_hash TEXT NOT NULL, 
	link_session_id UUID, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	consumed_at TIMESTAMP WITH TIME ZONE, 
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT oauth_attempt_expiry CHECK (expires_at > created_at), 
	UNIQUE (state_hash), 
	FOREIGN KEY(link_session_id) REFERENCES biletflow.auth_session (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;

CREATE INDEX ix_biletflow_oauth_attempt_link_session_id ON biletflow.oauth_attempt (link_session_id);


CREATE TABLE biletflow.refresh_token (
	session_id UUID NOT NULL, 
	token_hash TEXT NOT NULL, 
	consumed_at TIMESTAMP WITH TIME ZONE, 
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES biletflow.auth_session (id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	UNIQUE (token_hash)
)

;

CREATE INDEX ix_biletflow_refresh_token_session_id ON biletflow.refresh_token (session_id);


CREATE FUNCTION biletflow.reject_auth_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit history is immutable' USING ERRCODE = '23000'; END;
$$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON biletflow.audit_log
FOR EACH ROW EXECUTE FUNCTION biletflow.reject_auth_history_change();
CREATE FUNCTION biletflow.revoke_suspended_user_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'suspended' AND OLD.status <> 'suspended' THEN
    UPDATE biletflow.auth_session SET revoked_at = clock_timestamp()
    WHERE user_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER revoke_suspended_sessions AFTER UPDATE OF status ON biletflow.app_user
FOR EACH ROW EXECUTE FUNCTION biletflow.revoke_suspended_user_sessions();
CREATE INDEX ix_auth_jobs_ready ON biletflow.outbox_job (available_at, created_at) WHERE status = 'pending';
CREATE INDEX ix_auth_jobs_lease ON biletflow.outbox_job (lease_until) WHERE status = 'leased';
