-- Stage E: platform administration (BF-21). moderation_action targets users and events only;
-- the paid-sales target column arrives together with the activation tables (sales_activation).

CREATE TABLE biletflow.platform_admin (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	user_id UUID NOT NULL,
	granted_by_user_id UUID,
	revoked_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT platform_admin_uq1 UNIQUE (user_id),
	CONSTRAINT fk_platform_admin_078 FOREIGN KEY (user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_platform_admin_079 FOREIGN KEY (granted_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.event_report (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	event_id UUID NOT NULL,
	reporter_user_id UUID NOT NULL,
	category TEXT NOT NULL,
	description TEXT NOT NULL,
	status TEXT DEFAULT 'open' NOT NULL,
	reviewed_by_user_id UUID,
	reviewed_at TIMESTAMP WITH TIME ZONE,
	resolved_by_user_id UUID,
	resolution TEXT,
	resolved_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT event_report_ck1 CHECK (status IN ('open','reviewing','resolved')),
	CONSTRAINT event_report_ck2 CHECK (status <> 'resolved' OR (resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL AND resolution IS NOT NULL)),
	CONSTRAINT event_report_ck3 CHECK (category IN ('spam','fraud','inappropriate','misleading','safety','other')),
	CONSTRAINT event_report_ck4 CHECK (length(btrim(description)) > 0),
	CONSTRAINT fk_event_report_122 FOREIGN KEY (event_id) REFERENCES biletflow.event (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_event_report_123 FOREIGN KEY (reporter_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_event_report_124 FOREIGN KEY (resolved_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_event_report_125 FOREIGN KEY (reviewed_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
-- One live report per reporter, event and category, even under concurrent submissions.
CREATE UNIQUE INDEX uq_open_report ON biletflow.event_report (event_id, reporter_user_id, category) WHERE status IN ('open','reviewing');
CREATE INDEX ix_report_queue ON biletflow.event_report (status, created_at, id);
CREATE INDEX ix_report_reporter ON biletflow.event_report (reporter_user_id, created_at);

CREATE TABLE biletflow.moderation_action (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	actor_user_id UUID NOT NULL,
	target_user_id UUID,
	target_event_id UUID,
	action TEXT NOT NULL,
	reason TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT moderation_action_ck1 CHECK (num_nonnulls(target_user_id, target_event_id) = 1),
	CONSTRAINT moderation_action_ck2 CHECK (action IN ('suspend','reinstate')),
	CONSTRAINT moderation_action_ck3 CHECK (length(btrim(reason)) > 0),
	CONSTRAINT fk_moderation_action_071 FOREIGN KEY (target_event_id) REFERENCES biletflow.event (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_moderation_action_125 FOREIGN KEY (actor_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_moderation_action_126 FOREIGN KEY (target_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX ix_moderation_user ON biletflow.moderation_action (target_user_id, created_at) WHERE target_user_id IS NOT NULL;
CREATE INDEX ix_moderation_event ON biletflow.moderation_action (target_event_id, created_at) WHERE target_event_id IS NOT NULL;

CREATE TABLE biletflow.platform_setting_version (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	setting_key TEXT NOT NULL,
	version INTEGER NOT NULL,
	value JSONB NOT NULL,
	effective_at TIMESTAMP WITH TIME ZONE NOT NULL,
	actor_user_id UUID NOT NULL,
	reason TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT platform_setting_version_uq1 UNIQUE (setting_key, version),
	CONSTRAINT platform_setting_version_ck1 CHECK (version > 0),
	CONSTRAINT fk_platform_setting_version_127 FOREIGN KEY (actor_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX ix_effective_settings ON biletflow.platform_setting_version (setting_key, effective_at, version);

-- Moderation evidence and settings history are append-only (same guard as audit_log).
CREATE TRIGGER immutable_moderation BEFORE UPDATE OR DELETE ON biletflow.moderation_action
FOR EACH ROW EXECUTE FUNCTION biletflow.reject_auth_history_change();
CREATE TRIGGER immutable_settings BEFORE UPDATE OR DELETE ON biletflow.platform_setting_version
FOR EACH ROW EXECUTE FUNCTION biletflow.reject_auth_history_change();
