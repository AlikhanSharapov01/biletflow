-- Stage B: additive tables and scoped audit/outbox constraints. Existing identity data is retained.


CREATE TABLE biletflow.category (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	code TEXT NOT NULL, 
	name_kk TEXT NOT NULL, 
	name_ru TEXT NOT NULL, 
	name_en TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT category_uq1 UNIQUE (code)
)

;


CREATE TABLE biletflow.venue (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	name TEXT NOT NULL, 
	address TEXT NOT NULL, 
	city TEXT NOT NULL, 
	country_code TEXT DEFAULT 'KZ' NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT venue_ck1 CHECK (country_code = 'KZ')
)

;


CREATE TABLE biletflow.organization (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	owner_user_id UUID NOT NULL, 
	name TEXT NOT NULL, 
	contact_email TEXT NOT NULL, 
	contact_phone TEXT, 
	status TEXT DEFAULT 'active' NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT organization_ck1 CHECK (status IN ('active','suspended')), 
	CONSTRAINT fk_organization_080 FOREIGN KEY(owner_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.venue_layout (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	venue_id UUID NOT NULL, 
	name TEXT NOT NULL, 
	version INTEGER DEFAULT 1 NOT NULL, 
	canvas_width INTEGER NOT NULL, 
	canvas_height INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT venue_layout_ck1 CHECK (version > 0 AND canvas_width > 0 AND canvas_height > 0), 
	CONSTRAINT venue_layout_uq1 UNIQUE (venue_id, name, version), 
	CONSTRAINT venue_layout_uq2 UNIQUE (id, venue_id), 
	CONSTRAINT fk_venue_layout_010 FOREIGN KEY(venue_id) REFERENCES biletflow.venue (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.event (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	organization_id UUID NOT NULL, 
	category_id UUID NOT NULL, 
	venue_id UUID NOT NULL, 
	venue_layout_id UUID, 
	title TEXT NOT NULL, 
	description TEXT NOT NULL, 
	publication_state TEXT DEFAULT 'draft' NOT NULL, 
	moderation_state TEXT DEFAULT 'normal' NOT NULL, 
	visibility TEXT DEFAULT 'public' NOT NULL, 
	seating_mode TEXT DEFAULT 'general' NOT NULL, 
	capacity INTEGER NOT NULL, 
	starts_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	ends_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	time_zone TEXT DEFAULT 'Asia/Almaty' NOT NULL, 
	registration_opens_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	registration_closes_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	admission_opens_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	admission_closes_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	refund_allowed BOOLEAN DEFAULT true NOT NULL, 
	refund_cutoff_at TIMESTAMP WITH TIME ZONE, 
	calendar_uid TEXT NOT NULL, 
	calendar_sequence INTEGER DEFAULT 0 NOT NULL, 
	availability_version BIGINT DEFAULT 0 NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT event_ck1 CHECK (publication_state IN ('draft','published','unpublished','cancelled')), 
	CONSTRAINT event_ck2 CHECK (moderation_state IN ('normal','suspended')), 
	CONSTRAINT event_ck3 CHECK (visibility IN ('public','unlisted','private')), 
	CONSTRAINT event_ck4 CHECK (seating_mode IN ('general','assigned')), 
	CONSTRAINT event_ck5 CHECK (capacity >= 0), 
	CONSTRAINT event_ck6 CHECK (ends_at > starts_at), 
	CONSTRAINT event_ck7 CHECK (registration_closes_at > registration_opens_at AND registration_closes_at <= ends_at), 
	CONSTRAINT event_ck8 CHECK (admission_closes_at > admission_opens_at), 
	CONSTRAINT event_ck9 CHECK (NOT refund_allowed OR (refund_cutoff_at IS NOT NULL AND refund_cutoff_at <= starts_at)), 
	CONSTRAINT event_ck10 CHECK ((seating_mode = 'assigned') = (venue_layout_id IS NOT NULL)), 
	CONSTRAINT event_ck11 CHECK (calendar_sequence >= 0 AND availability_version >= 0), 
	CONSTRAINT event_uq1 UNIQUE (calendar_uid), 
	CONSTRAINT event_uq2 UNIQUE (id, organization_id), 
	CONSTRAINT event_uq3 UNIQUE (id, venue_layout_id), 
	CONSTRAINT fk_event_007 FOREIGN KEY(venue_layout_id, venue_id) REFERENCES biletflow.venue_layout (id, venue_id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_event_008 FOREIGN KEY(category_id) REFERENCES biletflow.category (id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_event_009 FOREIGN KEY(venue_id) REFERENCES biletflow.venue (id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_event_085 FOREIGN KEY(organization_id) REFERENCES biletflow.organization (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;

CREATE INDEX ix_catalog_public ON biletflow.event (publication_state, visibility, starts_at);


CREATE TABLE biletflow.organization_member (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	organization_id UUID NOT NULL, 
	user_id UUID NOT NULL, 
	status TEXT DEFAULT 'active' NOT NULL, 
	revoked_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT organization_member_ck1 CHECK (status IN ('active','revoked')), 
	CONSTRAINT organization_member_ck2 CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)), 
	CONSTRAINT organization_member_uq1 UNIQUE (organization_id, user_id), 
	CONSTRAINT organization_member_uq2 UNIQUE (id, organization_id), 
	CONSTRAINT fk_organization_member_002 FOREIGN KEY(organization_id) REFERENCES biletflow.organization (id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_organization_member_081 FOREIGN KEY(user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.staff_invitation (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	organization_id UUID NOT NULL, 
	email TEXT NOT NULL, 
	invited_by_user_id UUID NOT NULL, 
	token_hash TEXT NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	accepted_by_user_id UUID, 
	accepted_at TIMESTAMP WITH TIME ZONE, 
	revoked_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT staff_invitation_ck1 CHECK (email = lower(btrim(email))), 
	CONSTRAINT staff_invitation_ck2 CHECK (expires_at > created_at), 
	CONSTRAINT staff_invitation_ck3 CHECK ((accepted_at IS NULL) = (accepted_by_user_id IS NULL)), 
	CONSTRAINT staff_invitation_uq1 UNIQUE (token_hash), 
	CONSTRAINT fk_staff_invitation_082 FOREIGN KEY(organization_id) REFERENCES biletflow.organization (id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_staff_invitation_083 FOREIGN KEY(invited_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_staff_invitation_084 FOREIGN KEY(accepted_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;

CREATE INDEX ix_staff_invite_email ON biletflow.staff_invitation (organization_id, email);


CREATE TABLE biletflow.venue_section (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	layout_id UUID NOT NULL, 
	label TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT venue_section_uq1 UNIQUE (layout_id, label), 
	CONSTRAINT venue_section_uq2 UNIQUE (id, layout_id), 
	CONSTRAINT fk_venue_section_011 FOREIGN KEY(layout_id) REFERENCES biletflow.venue_layout (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.checkout_hold (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	event_id UUID NOT NULL, 
	buyer_user_id UUID NOT NULL, 
	status TEXT DEFAULT 'active' NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	closed_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT checkout_hold_ck1 CHECK (status IN ('active','consumed','expired','released')), 
	CONSTRAINT checkout_hold_ck2 CHECK (expires_at > created_at), 
	CONSTRAINT checkout_hold_ck3 CHECK ((status = 'active') = (closed_at IS NULL)), 
	CONSTRAINT checkout_hold_uq1 UNIQUE (id, event_id), 
	CONSTRAINT checkout_hold_uq2 UNIQUE (id, event_id, buyer_user_id), 
	CONSTRAINT fk_checkout_hold_092 FOREIGN KEY(event_id) REFERENCES biletflow.event (id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_checkout_hold_093 FOREIGN KEY(buyer_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.event_access_grant (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	event_id UUID NOT NULL, 
	user_id UUID NOT NULL, 
	granted_by_user_id UUID NOT NULL, 
	revoked_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT event_access_grant_uq1 UNIQUE (event_id, user_id), 
	CONSTRAINT fk_event_access_grant_086 FOREIGN KEY(event_id) REFERENCES biletflow.event (id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_event_access_grant_087 FOREIGN KEY(user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_event_access_grant_088 FOREIGN KEY(granted_by_user_id) REFERENCES biletflow.app_user (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.event_staff (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	event_id UUID NOT NULL, 
	organization_id UUID NOT NULL, 
	member_id UUID NOT NULL, 
	revoked_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT event_staff_uq1 UNIQUE (event_id, member_id), 
	CONSTRAINT event_staff_uq2 UNIQUE (id, event_id), 
	CONSTRAINT fk_event_staff_003 FOREIGN KEY(event_id, organization_id) REFERENCES biletflow.event (id, organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_event_staff_004 FOREIGN KEY(member_id, organization_id) REFERENCES biletflow.organization_member (id, organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.member_permission (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	member_id UUID NOT NULL, 
	capability TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	revoked_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT member_permission_ck1 CHECK (capability IN ('manage_profile','manage_staff','finance')), 
	CONSTRAINT member_permission_uq1 UNIQUE (member_id, capability), 
	CONSTRAINT fk_member_permission_005 FOREIGN KEY(member_id) REFERENCES biletflow.organization_member (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.ticket_type (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	event_id UUID NOT NULL, 
	name TEXT NOT NULL, 
	description TEXT NOT NULL, 
	kind TEXT NOT NULL, 
	price_minor BIGINT NOT NULL, 
	quantity_limit INTEGER NOT NULL, 
	per_order_limit INTEGER NOT NULL, 
	sales_open_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	sales_close_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	is_hidden BOOLEAN DEFAULT false NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ticket_type_ck1 CHECK (kind IN ('free','paid')), 
	CONSTRAINT ticket_type_ck2 CHECK ((kind = 'free' AND price_minor = 0) OR (kind = 'paid' AND price_minor > 0)), 
	CONSTRAINT ticket_type_ck3 CHECK (quantity_limit >= 0 AND per_order_limit > 0), 
	CONSTRAINT ticket_type_ck4 CHECK (sales_close_at > sales_open_at), 
	CONSTRAINT ticket_type_uq1 UNIQUE (id, event_id), 
	CONSTRAINT fk_ticket_type_091 FOREIGN KEY(event_id) REFERENCES biletflow.event (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.venue_row (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	layout_id UUID NOT NULL, 
	section_id UUID NOT NULL, 
	label TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT venue_row_uq1 UNIQUE (section_id, label), 
	CONSTRAINT venue_row_uq2 UNIQUE (id, layout_id), 
	CONSTRAINT fk_venue_row_012 FOREIGN KEY(section_id, layout_id) REFERENCES biletflow.venue_section (id, layout_id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.staff_permission (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	event_staff_id UUID NOT NULL, 
	capability TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	revoked_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT staff_permission_ck1 CHECK (capability IN ('event_edit','attendees','support','reports','refund','scan','reverse_checkin','staff')), 
	CONSTRAINT staff_permission_uq1 UNIQUE (event_staff_id, capability), 
	CONSTRAINT fk_staff_permission_006 FOREIGN KEY(event_staff_id) REFERENCES biletflow.event_staff (id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.venue_seat (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	layout_id UUID NOT NULL, 
	row_id UUID NOT NULL, 
	label TEXT NOT NULL, 
	price_category TEXT NOT NULL, 
	is_accessible BOOLEAN DEFAULT false NOT NULL, 
	x NUMERIC(10, 2) NOT NULL, 
	y NUMERIC(10, 2) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT venue_seat_ck1 CHECK (x >= 0 AND y >= 0), 
	CONSTRAINT venue_seat_uq1 UNIQUE (row_id, label), 
	CONSTRAINT venue_seat_uq2 UNIQUE (id, layout_id), 
	CONSTRAINT fk_venue_seat_013 FOREIGN KEY(row_id, layout_id) REFERENCES biletflow.venue_row (id, layout_id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.event_seat (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	event_id UUID NOT NULL, 
	layout_id UUID NOT NULL, 
	venue_seat_id UUID NOT NULL, 
	ticket_type_id UUID NOT NULL, 
	section_label TEXT NOT NULL, 
	row_label TEXT NOT NULL, 
	seat_label TEXT NOT NULL, 
	is_blocked BOOLEAN DEFAULT false NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT event_seat_uq1 UNIQUE (event_id, venue_seat_id), 
	CONSTRAINT event_seat_uq2 UNIQUE (event_id, section_label, row_label, seat_label), 
	CONSTRAINT event_seat_uq3 UNIQUE (id, event_id, ticket_type_id), 
	CONSTRAINT fk_event_seat_014 FOREIGN KEY(event_id, layout_id) REFERENCES biletflow.event (id, venue_layout_id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_event_seat_015 FOREIGN KEY(venue_seat_id, layout_id) REFERENCES biletflow.venue_seat (id, layout_id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_event_seat_016 FOREIGN KEY(ticket_type_id, event_id) REFERENCES biletflow.ticket_type (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;


CREATE TABLE biletflow.inventory_allocation (
	id UUID DEFAULT gen_random_uuid() NOT NULL, 
	event_id UUID NOT NULL, 
	hold_id UUID NOT NULL, 
	ticket_type_id UUID NOT NULL, 
	event_seat_id UUID, 
	state TEXT DEFAULT 'held' NOT NULL, 
	released_at TIMESTAMP WITH TIME ZONE, 
	release_reason TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT inventory_allocation_ck1 CHECK (state IN ('held','sold','refund_quarantine','released')), 
	CONSTRAINT inventory_allocation_ck2 CHECK ((state = 'released') = (released_at IS NOT NULL)), 
	CONSTRAINT inventory_allocation_ck3 CHECK ((state = 'released') = (release_reason IS NOT NULL)), 
	CONSTRAINT inventory_allocation_ck4 CHECK (release_reason IS NULL OR release_reason IN ('expired','abandoned','free_cancel','refund_succeeded')), 
	CONSTRAINT inventory_allocation_uq1 UNIQUE (id, event_id, hold_id, ticket_type_id), 
	CONSTRAINT fk_inventory_allocation_017 FOREIGN KEY(hold_id, event_id) REFERENCES biletflow.checkout_hold (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_inventory_allocation_018 FOREIGN KEY(ticket_type_id, event_id) REFERENCES biletflow.ticket_type (id, event_id) ON DELETE RESTRICT ON UPDATE RESTRICT, 
	CONSTRAINT fk_inventory_allocation_019 FOREIGN KEY(event_seat_id, event_id, ticket_type_id) REFERENCES biletflow.event_seat (id, event_id, ticket_type_id) ON DELETE RESTRICT ON UPDATE RESTRICT
)

;

CREATE INDEX ix_event_allocations ON biletflow.inventory_allocation (event_id, state);

CREATE UNIQUE INDEX uq_live_seat ON biletflow.inventory_allocation (event_seat_id) WHERE state IN ('held', 'sold', 'refund_quarantine');

ALTER TABLE biletflow.audit_log DROP CONSTRAINT auth_only_audit_scope;
ALTER TABLE biletflow.outbox_job DROP CONSTRAINT auth_only_outbox_scope;
ALTER TABLE biletflow.audit_log ADD CONSTRAINT fk_audit_event FOREIGN KEY(event_id,organization_id) REFERENCES biletflow.event(id,organization_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE biletflow.audit_log ADD CONSTRAINT fk_audit_organization FOREIGN KEY(organization_id) REFERENCES biletflow.organization(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE biletflow.outbox_job ADD CONSTRAINT fk_outbox_event FOREIGN KEY(event_id) REFERENCES biletflow.event(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX ix_member_user ON biletflow.organization_member(user_id);
CREATE INDEX ix_staff_member ON biletflow.event_staff(member_id);
CREATE INDEX ix_ticket_event ON biletflow.ticket_type(event_id);
CREATE INDEX ix_event_seat_event ON biletflow.event_seat(event_id);
