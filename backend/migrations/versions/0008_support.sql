-- BF-16 support. platform_admin comes from 0006_admin_moderation. Every message and case change carries a per-case, gap-free-in-commit-order `seq`
-- that clients use as the polling/WebSocket resume cursor. Attachments (stored_file,
-- support_attachment) are deliberately not created yet.

CREATE TABLE biletflow.support_case (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	requester_user_id UUID NOT NULL,
	organization_id UUID,
	event_id UUID,
	order_id UUID,
	ticket_id UUID,
	case_kind TEXT NOT NULL,
	category TEXT NOT NULL,
	subject TEXT NOT NULL,
	status TEXT DEFAULT 'open' NOT NULL,
	assigned_to_user_id UUID,
	escalated_at TIMESTAMP WITH TIME ZONE,
	resolved_at TIMESTAMP WITH TIME ZONE,
	last_seq BIGINT DEFAULT 0 NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT support_case_ck1 CHECK (case_kind IN ('attendee','organizer_platform')),
	CONSTRAINT support_case_ck2 CHECK (category IN ('delivery','payment','refund','seating','event_info','check_in','account','technical')),
	CONSTRAINT support_case_ck3 CHECK (status IN ('open','in_progress','waiting_for_customer','resolved')),
	CONSTRAINT support_case_ck4 CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
	CONSTRAINT support_case_ck5 CHECK (order_id IS NULL OR event_id IS NOT NULL),
	CONSTRAINT support_case_ck6 CHECK (ticket_id IS NULL OR event_id IS NOT NULL),
	CONSTRAINT support_case_ck7 CHECK (event_id IS NULL OR organization_id IS NOT NULL),
	CONSTRAINT support_case_ck8 CHECK (case_kind <> 'attendee' OR (event_id IS NOT NULL AND organization_id IS NOT NULL)),
	CONSTRAINT support_case_ck9 CHECK (case_kind <> 'organizer_platform' OR (organization_id IS NOT NULL AND order_id IS NULL AND ticket_id IS NULL AND escalated_at IS NULL)),
	CONSTRAINT support_case_ck10 CHECK (last_seq >= 0),
	CONSTRAINT support_case_ck11 CHECK (length(btrim(subject)) > 0),
	CONSTRAINT fk_support_case_org FOREIGN KEY (organization_id) REFERENCES biletflow.organization (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_support_case_event FOREIGN KEY (event_id, organization_id) REFERENCES biletflow.event (id, organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_support_case_order FOREIGN KEY (order_id, event_id) REFERENCES biletflow.ticket_order (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_support_case_ticket FOREIGN KEY (ticket_id, event_id) REFERENCES biletflow.ticket (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_support_case_requester FOREIGN KEY (requester_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_support_case_assignee FOREIGN KEY (assigned_to_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX ix_support_case_requester ON biletflow.support_case (requester_user_id, updated_at DESC, id);
CREATE INDEX ix_support_case_event ON biletflow.support_case (event_id, status, updated_at DESC);
CREATE INDEX ix_support_case_org ON biletflow.support_case (organization_id, case_kind, status);
CREATE INDEX ix_support_case_assignee ON biletflow.support_case (assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;

CREATE TABLE biletflow.support_message (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	case_id UUID NOT NULL,
	seq BIGINT NOT NULL,
	author_user_id UUID NOT NULL,
	client_message_id UUID NOT NULL,
	body TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT support_message_uq1 UNIQUE (case_id, author_user_id, client_message_id),
	CONSTRAINT support_message_uq2 UNIQUE (id, case_id),
	CONSTRAINT support_message_uq3 UNIQUE (case_id, seq),
	CONSTRAINT support_message_ck1 CHECK (length(btrim(body)) > 0),
	CONSTRAINT support_message_ck2 CHECK (seq > 0),
	CONSTRAINT fk_support_message_case FOREIGN KEY (case_id) REFERENCES biletflow.support_case (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_support_message_author FOREIGN KEY (author_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE biletflow.case_change (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	case_id UUID NOT NULL,
	seq BIGINT NOT NULL,
	actor_user_id UUID NOT NULL,
	change_kind TEXT NOT NULL,
	before_value TEXT,
	after_value TEXT,
	reason TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT case_change_uq1 UNIQUE (case_id, seq),
	CONSTRAINT case_change_ck1 CHECK (change_kind IN ('status','assignment','escalation')),
	CONSTRAINT case_change_ck2 CHECK (seq > 0),
	CONSTRAINT fk_case_change_case FOREIGN KEY (case_id) REFERENCES biletflow.support_case (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT fk_case_change_actor FOREIGN KEY (actor_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Messages and case history are append-only.
CREATE TRIGGER immutable_support_message BEFORE UPDATE OR DELETE ON biletflow.support_message
FOR EACH ROW EXECUTE FUNCTION biletflow.reject_auth_history_change();
CREATE TRIGGER immutable_case_change BEFORE UPDATE OR DELETE ON biletflow.case_change
FOR EACH ROW EXECUTE FUNCTION biletflow.reject_auth_history_change();
