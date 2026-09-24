-- BiletFlow physical schema design, PostgreSQL. Generated from schema_model.json.
-- Reference DDL only: TX contracts in the specification still require application/service implementation.
-- Run against an EMPTY database/schema for validation, not an existing production database.
-- Exact KZT minor units (1 KZT = 100 units); UUIDs generated with gen_random_uuid().
BEGIN;
CREATE SCHEMA biletflow;
SET search_path TO biletflow, public;

CREATE TABLE "app_user" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "display_name" text NOT NULL,
  "locale" text NOT NULL DEFAULT 'ru',
  "status" text NOT NULL DEFAULT 'active',
  "email_verified_at" timestamptz,
  "analytics_consent" boolean NOT NULL DEFAULT false,
  "consent_recorded_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_user_pk" PRIMARY KEY (id),
  CONSTRAINT "app_user_uq1" UNIQUE ("email"),
  CONSTRAINT "app_user_ck1" CHECK (email = lower(btrim(email)) AND position('@' in email) > 1),
  CONSTRAINT "app_user_ck2" CHECK (locale IN ('kk','ru','en')),
  CONSTRAINT "app_user_ck3" CHECK (status IN ('active','suspended'))
);
COMMENT ON TABLE "app_user" IS 'Verified account; roles are scoped memberships, not one global role.';
COMMENT ON COLUMN "app_user"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "app_user"."email" IS 'Normalized email; unique.';
COMMENT ON COLUMN "app_user"."password_hash" IS 'Adaptive salted password hash; never plaintext.';
COMMENT ON COLUMN "app_user"."display_name" IS 'Account display name.';
COMMENT ON COLUMN "app_user"."locale" IS 'kk, ru or en.';
COMMENT ON COLUMN "app_user"."status" IS 'active or suspended.';
COMMENT ON COLUMN "app_user"."email_verified_at" IS 'Required before ticket acquisition/admission.';
COMMENT ON COLUMN "app_user"."analytics_consent" IS 'Optional traffic collection preference.';
COMMENT ON COLUMN "app_user"."consent_recorded_at" IS 'When preference was last recorded.';
COMMENT ON COLUMN "app_user"."updated_at" IS 'Set by application on every update.';
COMMENT ON COLUMN "app_user"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "auth_session" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "refresh_token_hash" text NOT NULL,
  "client_kind" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "last_seen_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_session_pk" PRIMARY KEY (id),
  CONSTRAINT "auth_session_uq1" UNIQUE ("refresh_token_hash"),
  CONSTRAINT "auth_session_uq2" UNIQUE ("id", "user_id"),
  CONSTRAINT "auth_session_ck1" CHECK (client_kind IN ('web','scanner')),
  CONSTRAINT "auth_session_ck2" CHECK (expires_at > created_at)
);
COMMENT ON TABLE "auth_session" IS 'Revocable web or scanner session with rotated refresh-token digest.';
COMMENT ON COLUMN "auth_session"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "auth_session"."user_id" IS 'Account owner.';
COMMENT ON COLUMN "auth_session"."refresh_token_hash" IS 'Only digest stored; rotate on refresh.';
COMMENT ON COLUMN "auth_session"."client_kind" IS 'web or scanner.';
COMMENT ON COLUMN "auth_session"."expires_at" IS 'Absolute authorization expiry.';
COMMENT ON COLUMN "auth_session"."revoked_at" IS 'Set on logout/reset/suspension.';
COMMENT ON COLUMN "auth_session"."last_seen_at" IS 'Operational metadata.';
COMMENT ON COLUMN "auth_session"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "account_token" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "purpose" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_token_pk" PRIMARY KEY (id),
  CONSTRAINT "account_token_uq1" UNIQUE ("token_hash"),
  CONSTRAINT "account_token_ck1" CHECK (purpose IN ('email_verify','password_reset')),
  CONSTRAINT "account_token_ck2" CHECK (expires_at > created_at)
);
COMMENT ON TABLE "account_token" IS 'One-use email-verification or password-reset challenge.';
COMMENT ON COLUMN "account_token"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "account_token"."user_id" IS 'Account being verified/reset.';
COMMENT ON COLUMN "account_token"."purpose" IS 'email_verify or password_reset.';
COMMENT ON COLUMN "account_token"."token_hash" IS 'Digest only; never return this stored digest as a token.';
COMMENT ON COLUMN "account_token"."expires_at" IS 'Expiry.';
COMMENT ON COLUMN "account_token"."consumed_at" IS 'Consumption under row lock.';
COMMENT ON COLUMN "account_token"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "platform_admin" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "granted_by_user_id" uuid,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_admin_pk" PRIMARY KEY (id),
  CONSTRAINT "platform_admin_uq1" UNIQUE ("user_id")
);
COMMENT ON TABLE "platform_admin" IS 'Explicit audited internal-staff grant; unrelated to organization membership.';
COMMENT ON COLUMN "platform_admin"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "platform_admin"."user_id" IS 'Granted account.';
COMMENT ON COLUMN "platform_admin"."granted_by_user_id" IS 'NULL only for audited bootstrap.';
COMMENT ON COLUMN "platform_admin"."revoked_at" IS 'Revoke instead of deleting.';
COMMENT ON COLUMN "platform_admin"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "organization" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "contact_email" text NOT NULL,
  "contact_phone" text,
  "status" text NOT NULL DEFAULT 'active',
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_pk" PRIMARY KEY (id),
  CONSTRAINT "organization_ck1" CHECK (status IN ('active','suspended'))
);
COMMENT ON TABLE "organization" IS 'Organizer workspace; one owner remains even if other memberships are revoked.';
COMMENT ON COLUMN "organization"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "organization"."owner_user_id" IS 'Current owner; transfer only in authorized transaction.';
COMMENT ON COLUMN "organization"."name" IS 'Organizer name.';
COMMENT ON COLUMN "organization"."contact_email" IS 'Business contact.';
COMMENT ON COLUMN "organization"."contact_phone" IS 'Optional business contact.';
COMMENT ON COLUMN "organization"."status" IS 'active or suspended.';
COMMENT ON COLUMN "organization"."updated_at" IS 'Last change.';
COMMENT ON COLUMN "organization"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "organization_member" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_member_pk" PRIMARY KEY (id),
  CONSTRAINT "organization_member_uq1" UNIQUE ("organization_id", "user_id"),
  CONSTRAINT "organization_member_uq2" UNIQUE ("id", "organization_id"),
  CONSTRAINT "organization_member_ck1" CHECK (status IN ('active','revoked')),
  CONSTRAINT "organization_member_ck2" CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
COMMENT ON TABLE "organization_member" IS 'Workspace membership, including scanner-only members.';
COMMENT ON COLUMN "organization_member"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "organization_member"."organization_id" IS 'Workspace.';
COMMENT ON COLUMN "organization_member"."user_id" IS 'Member.';
COMMENT ON COLUMN "organization_member"."status" IS 'active or revoked.';
COMMENT ON COLUMN "organization_member"."revoked_at" IS 'Retained for attribution.';
COMMENT ON COLUMN "organization_member"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "member_permission" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "member_id" uuid NOT NULL,
  "capability" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "member_permission_pk" PRIMARY KEY (id),
  CONSTRAINT "member_permission_uq1" UNIQUE ("member_id", "capability"),
  CONSTRAINT "member_permission_ck1" CHECK (capability IN ('manage_profile','manage_staff','finance'))
);
COMMENT ON TABLE "member_permission" IS 'Organization-level capability, excluding implicit ownership.';
COMMENT ON COLUMN "member_permission"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "member_permission"."member_id" IS 'Organization membership.';
COMMENT ON COLUMN "member_permission"."capability" IS 'manage_profile, manage_staff or finance.';
COMMENT ON COLUMN "member_permission"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "staff_invitation" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "email" text NOT NULL,
  "invited_by_user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "accepted_by_user_id" uuid,
  "accepted_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_invitation_pk" PRIMARY KEY (id),
  CONSTRAINT "staff_invitation_uq1" UNIQUE ("token_hash"),
  CONSTRAINT "staff_invitation_ck1" CHECK (email = lower(btrim(email))),
  CONSTRAINT "staff_invitation_ck2" CHECK (expires_at > created_at),
  CONSTRAINT "staff_invitation_ck3" CHECK ((accepted_at IS NULL) = (accepted_by_user_id IS NULL))
);
COMMENT ON TABLE "staff_invitation" IS 'Expiring workspace invitation; owner configures final event permissions on acceptance.';
COMMENT ON COLUMN "staff_invitation"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "staff_invitation"."organization_id" IS 'Inviting workspace.';
COMMENT ON COLUMN "staff_invitation"."email" IS 'Normalized intended recipient.';
COMMENT ON COLUMN "staff_invitation"."invited_by_user_id" IS 'Inviter.';
COMMENT ON COLUMN "staff_invitation"."token_hash" IS 'Opaque invite-token digest.';
COMMENT ON COLUMN "staff_invitation"."expires_at" IS 'Expiry.';
COMMENT ON COLUMN "staff_invitation"."accepted_by_user_id" IS 'Account matching verified invited email.';
COMMENT ON COLUMN "staff_invitation"."accepted_at" IS 'Acceptance timestamp.';
COMMENT ON COLUMN "staff_invitation"."revoked_at" IS 'Revoke without deletion.';
COMMENT ON COLUMN "staff_invitation"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "event_staff" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_staff_pk" PRIMARY KEY (id),
  CONSTRAINT "event_staff_uq1" UNIQUE ("event_id", "member_id"),
  CONSTRAINT "event_staff_uq2" UNIQUE ("id", "event_id")
);
COMMENT ON TABLE "event_staff" IS 'Event assignment constrained to membership in the event''s organization.';
COMMENT ON COLUMN "event_staff"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "event_staff"."event_id" IS 'Assigned event.';
COMMENT ON COLUMN "event_staff"."organization_id" IS 'Scope discriminator, checked by composite FKs.';
COMMENT ON COLUMN "event_staff"."member_id" IS 'Member in same organization.';
COMMENT ON COLUMN "event_staff"."revoked_at" IS 'Online authorization stops immediately.';
COMMENT ON COLUMN "event_staff"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "staff_permission" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_staff_id" uuid NOT NULL,
  "capability" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_permission_pk" PRIMARY KEY (id),
  CONSTRAINT "staff_permission_uq1" UNIQUE ("event_staff_id", "capability"),
  CONSTRAINT "staff_permission_ck1" CHECK (capability IN ('event_edit','attendees','support','reports','refund','scan','reverse_checkin','staff'))
);
COMMENT ON TABLE "staff_permission" IS 'Event-level permission set; multiple capabilities per assignment.';
COMMENT ON COLUMN "staff_permission"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "staff_permission"."event_staff_id" IS 'Assigned staff.';
COMMENT ON COLUMN "staff_permission"."capability" IS 'event_edit, attendees, support, reports, refund, scan, reverse_checkin, staff.';
COMMENT ON COLUMN "staff_permission"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "category" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" text NOT NULL,
  "name_kk" text NOT NULL,
  "name_ru" text NOT NULL,
  "name_en" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "category_pk" PRIMARY KEY (id),
  CONSTRAINT "category_uq1" UNIQUE ("code")
);
COMMENT ON TABLE "category" IS 'Seeded category with three interface labels.';
COMMENT ON COLUMN "category"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "category"."code" IS 'Stable category code.';
COMMENT ON COLUMN "category"."name_kk" IS 'Kazakh label.';
COMMENT ON COLUMN "category"."name_ru" IS 'Russian label.';
COMMENT ON COLUMN "category"."name_en" IS 'English label.';
COMMENT ON COLUMN "category"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "event" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "venue_id" uuid NOT NULL,
  "venue_layout_id" uuid,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "publication_state" text NOT NULL DEFAULT 'draft',
  "moderation_state" text NOT NULL DEFAULT 'normal',
  "visibility" text NOT NULL DEFAULT 'public',
  "seating_mode" text NOT NULL DEFAULT 'general',
  "capacity" integer NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "time_zone" text NOT NULL DEFAULT 'Asia/Almaty',
  "registration_opens_at" timestamptz NOT NULL,
  "registration_closes_at" timestamptz NOT NULL,
  "admission_opens_at" timestamptz NOT NULL,
  "admission_closes_at" timestamptz NOT NULL,
  "refund_allowed" boolean NOT NULL DEFAULT true,
  "refund_cutoff_at" timestamptz,
  "calendar_uid" text NOT NULL,
  "calendar_sequence" integer NOT NULL DEFAULT 0,
  "availability_version" bigint NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_pk" PRIMARY KEY (id),
  CONSTRAINT "event_uq1" UNIQUE ("calendar_uid"),
  CONSTRAINT "event_uq2" UNIQUE ("id", "organization_id"),
  CONSTRAINT "event_uq3" UNIQUE ("id", "venue_layout_id"),
  CONSTRAINT "event_ck1" CHECK (publication_state IN ('draft','published','unpublished','cancelled')),
  CONSTRAINT "event_ck2" CHECK (moderation_state IN ('normal','suspended')),
  CONSTRAINT "event_ck3" CHECK (visibility IN ('public','unlisted','private')),
  CONSTRAINT "event_ck4" CHECK (seating_mode IN ('general','assigned')),
  CONSTRAINT "event_ck5" CHECK (capacity >= 0),
  CONSTRAINT "event_ck6" CHECK (ends_at > starts_at),
  CONSTRAINT "event_ck7" CHECK (registration_closes_at > registration_opens_at AND registration_closes_at <= ends_at),
  CONSTRAINT "event_ck8" CHECK (admission_closes_at > admission_opens_at),
  CONSTRAINT "event_ck9" CHECK (NOT refund_allowed OR (refund_cutoff_at IS NOT NULL AND refund_cutoff_at <= starts_at)),
  CONSTRAINT "event_ck10" CHECK ((seating_mode = 'assigned') = (venue_layout_id IS NOT NULL)),
  CONSTRAINT "event_ck11" CHECK (calendar_sequence >= 0 AND availability_version >= 0)
);
COMMENT ON TABLE "event" IS 'Lifecycle, time, access, capacity and calendar identity. No stored upcoming/completed flag.';
COMMENT ON COLUMN "event"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "event"."organization_id" IS 'Owning workspace.';
COMMENT ON COLUMN "event"."category_id" IS 'Catalogue category.';
COMMENT ON COLUMN "event"."venue_id" IS 'Physical venue.';
COMMENT ON COLUMN "event"."venue_layout_id" IS 'Required for assigned seating.';
COMMENT ON COLUMN "event"."title" IS 'User-authored title.';
COMMENT ON COLUMN "event"."description" IS 'Sanitized on rendering.';
COMMENT ON COLUMN "event"."publication_state" IS 'draft, published, unpublished, cancelled.';
COMMENT ON COLUMN "event"."moderation_state" IS 'normal or suspended.';
COMMENT ON COLUMN "event"."visibility" IS 'public, unlisted or private.';
COMMENT ON COLUMN "event"."seating_mode" IS 'general or assigned.';
COMMENT ON COLUMN "event"."capacity" IS 'Configured total capacity.';
COMMENT ON COLUMN "event"."starts_at" IS 'Start instant.';
COMMENT ON COLUMN "event"."ends_at" IS 'End instant.';
COMMENT ON COLUMN "event"."time_zone" IS 'Validate against PostgreSQL timezone names.';
COMMENT ON COLUMN "event"."registration_opens_at" IS 'Opening instant.';
COMMENT ON COLUMN "event"."registration_closes_at" IS 'Closing instant.';
COMMENT ON COLUMN "event"."admission_opens_at" IS 'Configured entrance start.';
COMMENT ON COLUMN "event"."admission_closes_at" IS 'Configured entrance end.';
COMMENT ON COLUMN "event"."refund_allowed" IS 'Voluntary refund rule.';
COMMENT ON COLUMN "event"."refund_cutoff_at" IS 'Required when voluntary refunds allowed.';
COMMENT ON COLUMN "event"."calendar_uid" IS 'Stable ICS UID, independent of version.';
COMMENT ON COLUMN "event"."calendar_sequence" IS 'Increment for calendar-relevant changes.';
COMMENT ON COLUMN "event"."availability_version" IS 'Increment on inventory/admission/revocation changes.';
COMMENT ON COLUMN "event"."updated_at" IS 'Application updates.';
COMMENT ON COLUMN "event"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "event_access_grant" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "granted_by_user_id" uuid NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_access_grant_pk" PRIMARY KEY (id),
  CONSTRAINT "event_access_grant_uq1" UNIQUE ("event_id", "user_id")
);
COMMENT ON TABLE "event_access_grant" IS 'Account-specific invitation/access grant for private event.';
COMMENT ON COLUMN "event_access_grant"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "event_access_grant"."event_id" IS 'Private event.';
COMMENT ON COLUMN "event_access_grant"."user_id" IS 'Granted registered account.';
COMMENT ON COLUMN "event_access_grant"."granted_by_user_id" IS 'Authorized actor.';
COMMENT ON COLUMN "event_access_grant"."revoked_at" IS 'Revoke private access.';
COMMENT ON COLUMN "event_access_grant"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "event_media" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "file_id" uuid NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "alt_text" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_media_pk" PRIMARY KEY (id),
  CONSTRAINT "event_media_uq1" UNIQUE ("event_id", "sort_order"),
  CONSTRAINT "event_media_uq2" UNIQUE ("event_id", "file_id"),
  CONSTRAINT "event_media_ck1" CHECK (sort_order >= 0)
);
COMMENT ON TABLE "event_media" IS 'Ordered event images; storage lifecycle separate from publication.';
COMMENT ON COLUMN "event_media"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "event_media"."event_id" IS 'Owning event.';
COMMENT ON COLUMN "event_media"."file_id" IS 'Stored clean image.';
COMMENT ON COLUMN "event_media"."sort_order" IS 'Display order.';
COMMENT ON COLUMN "event_media"."alt_text" IS 'Accessible image description.';
COMMENT ON COLUMN "event_media"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "venue" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "address" text NOT NULL,
  "city" text NOT NULL,
  "country_code" text NOT NULL DEFAULT 'KZ',
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "venue_pk" PRIMARY KEY (id),
  CONSTRAINT "venue_ck1" CHECK (country_code = 'KZ')
);
COMMENT ON TABLE "venue" IS 'Reusable physical location; address snapshotted on orders.';
COMMENT ON COLUMN "venue"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "venue"."name" IS 'Venue name.';
COMMENT ON COLUMN "venue"."address" IS 'Postal/street address.';
COMMENT ON COLUMN "venue"."city" IS 'Discovery location.';
COMMENT ON COLUMN "venue"."country_code" IS 'Initial Kazakhstan release.';
COMMENT ON COLUMN "venue"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "venue_layout" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "venue_id" uuid NOT NULL,
  "name" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "canvas_width" integer NOT NULL,
  "canvas_height" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "venue_layout_pk" PRIMARY KEY (id),
  CONSTRAINT "venue_layout_uq1" UNIQUE ("venue_id", "name", "version"),
  CONSTRAINT "venue_layout_uq2" UNIQUE ("id", "venue_id"),
  CONSTRAINT "venue_layout_ck1" CHECK (version > 0 AND canvas_width > 0 AND canvas_height > 0)
);
COMMENT ON TABLE "venue_layout" IS 'Versioned predefined layout; immutable after copied into a selling event.';
COMMENT ON COLUMN "venue_layout"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "venue_layout"."venue_id" IS 'Physical venue.';
COMMENT ON COLUMN "venue_layout"."name" IS 'Layout name.';
COMMENT ON COLUMN "venue_layout"."version" IS 'Seed layout revision.';
COMMENT ON COLUMN "venue_layout"."canvas_width" IS 'Seat-map coordinate width.';
COMMENT ON COLUMN "venue_layout"."canvas_height" IS 'Seat-map coordinate height.';
COMMENT ON COLUMN "venue_layout"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "venue_section" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "layout_id" uuid NOT NULL,
  "label" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "venue_section_pk" PRIMARY KEY (id),
  CONSTRAINT "venue_section_uq1" UNIQUE ("layout_id", "label"),
  CONSTRAINT "venue_section_uq2" UNIQUE ("id", "layout_id")
);
COMMENT ON TABLE "venue_section" IS 'Section inside a layout.';
COMMENT ON COLUMN "venue_section"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "venue_section"."layout_id" IS 'Layout.';
COMMENT ON COLUMN "venue_section"."label" IS 'Section identifier.';
COMMENT ON COLUMN "venue_section"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "venue_row" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "layout_id" uuid NOT NULL,
  "section_id" uuid NOT NULL,
  "label" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "venue_row_pk" PRIMARY KEY (id),
  CONSTRAINT "venue_row_uq1" UNIQUE ("section_id", "label"),
  CONSTRAINT "venue_row_uq2" UNIQUE ("id", "layout_id")
);
COMMENT ON TABLE "venue_row" IS 'Numbered/labelled row in a section.';
COMMENT ON COLUMN "venue_row"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "venue_row"."layout_id" IS 'Composite scope.';
COMMENT ON COLUMN "venue_row"."section_id" IS 'Section in same layout.';
COMMENT ON COLUMN "venue_row"."label" IS 'Row identifier.';
COMMENT ON COLUMN "venue_row"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "venue_seat" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "layout_id" uuid NOT NULL,
  "row_id" uuid NOT NULL,
  "label" text NOT NULL,
  "price_category" text NOT NULL,
  "is_accessible" boolean NOT NULL DEFAULT false,
  "x" numeric(10,2) NOT NULL,
  "y" numeric(10,2) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "venue_seat_pk" PRIMARY KEY (id),
  CONSTRAINT "venue_seat_uq1" UNIQUE ("row_id", "label"),
  CONSTRAINT "venue_seat_uq2" UNIQUE ("id", "layout_id"),
  CONSTRAINT "venue_seat_ck1" CHECK (x >= 0 AND y >= 0)
);
COMMENT ON TABLE "venue_seat" IS 'Physical seat and accessibility metadata, not per-event availability.';
COMMENT ON COLUMN "venue_seat"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "venue_seat"."layout_id" IS 'Layout.';
COMMENT ON COLUMN "venue_seat"."row_id" IS 'Row in same layout.';
COMMENT ON COLUMN "venue_seat"."label" IS 'Seat number/label.';
COMMENT ON COLUMN "venue_seat"."price_category" IS 'Predefined category mapped to event ticket types.';
COMMENT ON COLUMN "venue_seat"."is_accessible" IS 'Accessibility is independent of sale state.';
COMMENT ON COLUMN "venue_seat"."x" IS 'Seat-map X.';
COMMENT ON COLUMN "venue_seat"."y" IS 'Seat-map Y.';
COMMENT ON COLUMN "venue_seat"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "ticket_type" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "kind" text NOT NULL,
  "price_minor" bigint NOT NULL,
  "quantity_limit" integer NOT NULL,
  "per_order_limit" integer NOT NULL,
  "sales_open_at" timestamptz NOT NULL,
  "sales_close_at" timestamptz NOT NULL,
  "is_hidden" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_type_pk" PRIMARY KEY (id),
  CONSTRAINT "ticket_type_uq1" UNIQUE ("id", "event_id"),
  CONSTRAINT "ticket_type_ck1" CHECK (kind IN ('free','paid')),
  CONSTRAINT "ticket_type_ck2" CHECK ((kind = 'free' AND price_minor = 0) OR (kind = 'paid' AND price_minor > 0)),
  CONSTRAINT "ticket_type_ck3" CHECK (quantity_limit >= 0 AND per_order_limit > 0),
  CONSTRAINT "ticket_type_ck4" CHECK (sales_close_at > sales_open_at)
);
COMMENT ON TABLE "ticket_type" IS 'Event-specific free/paid product; type remains paid even if discounted to zero.';
COMMENT ON COLUMN "ticket_type"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "ticket_type"."event_id" IS 'Owning event.';
COMMENT ON COLUMN "ticket_type"."name" IS 'Ticket name.';
COMMENT ON COLUMN "ticket_type"."description" IS 'Ticket description.';
COMMENT ON COLUMN "ticket_type"."kind" IS 'free or paid.';
COMMENT ON COLUMN "ticket_type"."price_minor" IS 'KZT minor units.';
COMMENT ON COLUMN "ticket_type"."quantity_limit" IS 'Total type capacity.';
COMMENT ON COLUMN "ticket_type"."per_order_limit" IS 'Maximum units in one order.';
COMMENT ON COLUMN "ticket_type"."sales_open_at" IS 'Type sales opening.';
COMMENT ON COLUMN "ticket_type"."sales_close_at" IS 'Type sales closing.';
COMMENT ON COLUMN "ticket_type"."is_hidden" IS 'Hide without deleting history.';
COMMENT ON COLUMN "ticket_type"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "event_seat" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "layout_id" uuid NOT NULL,
  "venue_seat_id" uuid NOT NULL,
  "ticket_type_id" uuid NOT NULL,
  "section_label" text NOT NULL,
  "row_label" text NOT NULL,
  "seat_label" text NOT NULL,
  "is_blocked" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_seat_pk" PRIMARY KEY (id),
  CONSTRAINT "event_seat_uq1" UNIQUE ("event_id", "venue_seat_id"),
  CONSTRAINT "event_seat_uq2" UNIQUE ("event_id", "section_label", "row_label", "seat_label"),
  CONSTRAINT "event_seat_uq3" UNIQUE ("id", "event_id", "ticket_type_id")
);
COMMENT ON TABLE "event_seat" IS 'Seat copied into one event and mapped to an event ticket type.';
COMMENT ON COLUMN "event_seat"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "event_seat"."event_id" IS 'Event with assigned seating.';
COMMENT ON COLUMN "event_seat"."layout_id" IS 'Must equal event''s configured layout.';
COMMENT ON COLUMN "event_seat"."venue_seat_id" IS 'Seat in same layout.';
COMMENT ON COLUMN "event_seat"."ticket_type_id" IS 'Ticket type for this event.';
COMMENT ON COLUMN "event_seat"."section_label" IS 'Stable event label snapshot.';
COMMENT ON COLUMN "event_seat"."row_label" IS 'Stable event label snapshot.';
COMMENT ON COLUMN "event_seat"."seat_label" IS 'Stable event label snapshot.';
COMMENT ON COLUMN "event_seat"."is_blocked" IS 'Organizer removes from sale; independent of allocation state.';
COMMENT ON COLUMN "event_seat"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "checkout_hold" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "buyer_user_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "expires_at" timestamptz NOT NULL,
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkout_hold_pk" PRIMARY KEY (id),
  CONSTRAINT "checkout_hold_uq1" UNIQUE ("id", "event_id"),
  CONSTRAINT "checkout_hold_uq2" UNIQUE ("id", "event_id", "buyer_user_id"),
  CONSTRAINT "checkout_hold_ck1" CHECK (status IN ('active','consumed','expired','released')),
  CONSTRAINT "checkout_hold_ck2" CHECK (expires_at > created_at),
  CONSTRAINT "checkout_hold_ck3" CHECK ((status = 'active') = (closed_at IS NULL))
);
COMMENT ON TABLE "checkout_hold" IS 'Authenticated basket reservation; one event and buyer per hold.';
COMMENT ON COLUMN "checkout_hold"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "checkout_hold"."event_id" IS 'Reserved event.';
COMMENT ON COLUMN "checkout_hold"."buyer_user_id" IS 'Verified buyer.';
COMMENT ON COLUMN "checkout_hold"."status" IS 'active, consumed, expired or released.';
COMMENT ON COLUMN "checkout_hold"."expires_at" IS 'Server-authoritative expiry.';
COMMENT ON COLUMN "checkout_hold"."closed_at" IS 'Set when no longer active.';
COMMENT ON COLUMN "checkout_hold"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "inventory_allocation" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "hold_id" uuid NOT NULL,
  "ticket_type_id" uuid NOT NULL,
  "event_seat_id" uuid,
  "state" text NOT NULL DEFAULT 'held',
  "released_at" timestamptz,
  "release_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_allocation_pk" PRIMARY KEY (id),
  CONSTRAINT "inventory_allocation_uq1" UNIQUE ("id", "event_id", "hold_id", "ticket_type_id"),
  CONSTRAINT "inventory_allocation_ck1" CHECK (state IN ('held','sold','refund_quarantine','released')),
  CONSTRAINT "inventory_allocation_ck2" CHECK ((state = 'released') = (released_at IS NOT NULL)),
  CONSTRAINT "inventory_allocation_ck3" CHECK ((state = 'released') = (release_reason IS NOT NULL)),
  CONSTRAINT "inventory_allocation_ck4" CHECK (release_reason IS NULL OR release_reason IN ('expired','abandoned','free_cancel','refund_succeeded'))
);
COMMENT ON TABLE "inventory_allocation" IS 'One row per admission unit; preserve allocation history after release.';
COMMENT ON COLUMN "inventory_allocation"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "inventory_allocation"."event_id" IS 'Event scope.';
COMMENT ON COLUMN "inventory_allocation"."hold_id" IS 'Original hold; remains linked after sale/refund.';
COMMENT ON COLUMN "inventory_allocation"."ticket_type_id" IS 'Type in same event.';
COMMENT ON COLUMN "inventory_allocation"."event_seat_id" IS 'NULL for general admission; required for assigned seating by TX-03.';
COMMENT ON COLUMN "inventory_allocation"."state" IS 'held, sold, refund_quarantine or released.';
COMMENT ON COLUMN "inventory_allocation"."released_at" IS 'Non-NULL only when released.';
COMMENT ON COLUMN "inventory_allocation"."release_reason" IS 'expired, abandoned, free_cancel or refund_succeeded.';
COMMENT ON COLUMN "inventory_allocation"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "ticket_order" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "buyer_user_id" uuid NOT NULL,
  "hold_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "currency" text NOT NULL DEFAULT 'KZT',
  "gross_minor" bigint NOT NULL,
  "discount_minor" bigint NOT NULL DEFAULT 0,
  "payable_minor" bigint NOT NULL,
  "processing_fee_minor" bigint NOT NULL DEFAULT 0,
  "processing_rate_bps" integer NOT NULL DEFAULT 300,
  "policy_snapshot" jsonb NOT NULL,
  "event_snapshot" jsonb NOT NULL,
  "quote_expires_at" timestamptz NOT NULL,
  "confirmed_at" timestamptz,
  "fulfillment_payment_attempt_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_order_pk" PRIMARY KEY (id),
  CONSTRAINT "ticket_order_uq1" UNIQUE ("hold_id"),
  CONSTRAINT "ticket_order_uq2" UNIQUE ("fulfillment_payment_attempt_id"),
  CONSTRAINT "ticket_order_uq3" UNIQUE ("id", "event_id"),
  CONSTRAINT "ticket_order_uq4" UNIQUE ("id", "event_id", "hold_id"),
  CONSTRAINT "ticket_order_ck1" CHECK (status IN ('pending','confirmed','failed','expired','cancelled','refund_pending','refunded')),
  CONSTRAINT "ticket_order_ck2" CHECK (currency = 'KZT'),
  CONSTRAINT "ticket_order_ck3" CHECK (gross_minor >= 0 AND discount_minor BETWEEN 0 AND gross_minor),
  CONSTRAINT "ticket_order_ck4" CHECK (payable_minor = gross_minor - discount_minor),
  CONSTRAINT "ticket_order_ck5" CHECK (processing_fee_minor BETWEEN 0 AND payable_minor),
  CONSTRAINT "ticket_order_ck6" CHECK (processing_rate_bps BETWEEN 0 AND 10000),
  CONSTRAINT "ticket_order_ck7" CHECK (jsonb_typeof(policy_snapshot) = 'object' AND jsonb_typeof(event_snapshot) = 'object'),
  CONSTRAINT "ticket_order_ck8" CHECK (status NOT IN ('confirmed','refund_pending','refunded') OR confirmed_at IS NOT NULL),
  CONSTRAINT "ticket_order_ck9" CHECK (confirmed_at IS NULL OR ((payable_minor = 0 AND fulfillment_payment_attempt_id IS NULL) OR (payable_minor > 0 AND fulfillment_payment_attempt_id IS NOT NULL)))
);
COMMENT ON TABLE "ticket_order" IS 'One event per order; immutable quote and lifecycle separate from payment attempts.';
COMMENT ON COLUMN "ticket_order"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "ticket_order"."event_id" IS 'Event scope.';
COMMENT ON COLUMN "ticket_order"."buyer_user_id" IS 'Purchaser, not necessarily recipient.';
COMMENT ON COLUMN "ticket_order"."hold_id" IS 'Same event/buyer; one order per hold.';
COMMENT ON COLUMN "ticket_order"."status" IS 'pending, confirmed, failed, expired, cancelled, refund_pending or refunded.';
COMMENT ON COLUMN "ticket_order"."currency" IS 'Initial currency.';
COMMENT ON COLUMN "ticket_order"."gross_minor" IS 'Sum of item face values.';
COMMENT ON COLUMN "ticket_order"."discount_minor" IS 'Sum of item discounts.';
COMMENT ON COLUMN "ticket_order"."payable_minor" IS 'gross minus discount; buyer fee zero.';
COMMENT ON COLUMN "ticket_order"."processing_fee_minor" IS 'Organizer charge snapshot.';
COMMENT ON COLUMN "ticket_order"."processing_rate_bps" IS 'Basis-point rate snapshot.';
COMMENT ON COLUMN "ticket_order"."policy_snapshot" IS 'Versioned refund/fee policy object.';
COMMENT ON COLUMN "ticket_order"."event_snapshot" IS 'Versioned title, times, timezone, venue/address.';
COMMENT ON COLUMN "ticket_order"."quote_expires_at" IS 'Accepted quote expiry.';
COMMENT ON COLUMN "ticket_order"."confirmed_at" IS 'First and only fulfillment time.';
COMMENT ON COLUMN "ticket_order"."fulfillment_payment_attempt_id" IS 'NULL for zero-total orders.';
COMMENT ON COLUMN "ticket_order"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "order_item" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "hold_id" uuid NOT NULL,
  "ticket_type_id" uuid NOT NULL,
  "allocation_id" uuid NOT NULL,
  "unit_number" integer NOT NULL,
  "ticket_type_name" text NOT NULL,
  "recipient_name" text NOT NULL,
  "recipient_email" text NOT NULL,
  "face_value_minor" bigint NOT NULL,
  "discount_minor" bigint NOT NULL DEFAULT 0,
  "paid_minor" bigint NOT NULL,
  "processing_fee_minor" bigint NOT NULL DEFAULT 0,
  "seat_snapshot" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_item_pk" PRIMARY KEY (id),
  CONSTRAINT "order_item_uq1" UNIQUE ("allocation_id"),
  CONSTRAINT "order_item_uq2" UNIQUE ("order_id", "unit_number"),
  CONSTRAINT "order_item_uq3" UNIQUE ("id", "event_id"),
  CONSTRAINT "order_item_ck1" CHECK (unit_number > 0),
  CONSTRAINT "order_item_ck2" CHECK (recipient_email = lower(btrim(recipient_email))),
  CONSTRAINT "order_item_ck3" CHECK (face_value_minor >= 0 AND discount_minor BETWEEN 0 AND face_value_minor),
  CONSTRAINT "order_item_ck4" CHECK (paid_minor = face_value_minor - discount_minor),
  CONSTRAINT "order_item_ck5" CHECK (processing_fee_minor BETWEEN 0 AND paid_minor),
  CONSTRAINT "order_item_ck6" CHECK (seat_snapshot IS NULL OR jsonb_typeof(seat_snapshot) = 'object')
);
COMMENT ON TABLE "order_item" IS 'One admission unit, not an aggregate line: simplifies seat, recipient, ticket and refund mapping.';
COMMENT ON COLUMN "order_item"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "order_item"."order_id" IS 'Purchaser order.';
COMMENT ON COLUMN "order_item"."event_id" IS 'Scope discriminator.';
COMMENT ON COLUMN "order_item"."hold_id" IS 'Must match order and allocation.';
COMMENT ON COLUMN "order_item"."ticket_type_id" IS 'Same type as allocation.';
COMMENT ON COLUMN "order_item"."allocation_id" IS 'Exactly one retained allocation.';
COMMENT ON COLUMN "order_item"."unit_number" IS 'Sequence in order, starting at 1.';
COMMENT ON COLUMN "order_item"."ticket_type_name" IS 'Purchased name snapshot.';
COMMENT ON COLUMN "order_item"."recipient_name" IS 'Attendee name snapshot.';
COMMENT ON COLUMN "order_item"."recipient_email" IS 'Normalized intended recipient; no later resale/transfer.';
COMMENT ON COLUMN "order_item"."face_value_minor" IS 'Unit price snapshot.';
COMMENT ON COLUMN "order_item"."discount_minor" IS 'Allocated campaign discount.';
COMMENT ON COLUMN "order_item"."paid_minor" IS 'face minus discount.';
COMMENT ON COLUMN "order_item"."processing_fee_minor" IS 'Deterministic fee allocation.';
COMMENT ON COLUMN "order_item"."seat_snapshot" IS 'Section/row/seat when assigned.';
COMMENT ON COLUMN "order_item"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "payment_intent" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "order_id" uuid,
  "activation_id" uuid,
  "purpose" text NOT NULL,
  "expected_minor" bigint NOT NULL,
  "currency" text NOT NULL DEFAULT 'KZT',
  "environment" text NOT NULL DEFAULT 'simulation',
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_intent_pk" PRIMARY KEY (id),
  CONSTRAINT "payment_intent_uq1" UNIQUE ("order_id"),
  CONSTRAINT "payment_intent_uq2" UNIQUE ("activation_id"),
  CONSTRAINT "payment_intent_uq3" UNIQUE ("id", "event_id", "environment"),
  CONSTRAINT "payment_intent_ck1" CHECK ((purpose = 'ticket_order' AND order_id IS NOT NULL AND activation_id IS NULL) OR (purpose = 'activation' AND activation_id IS NOT NULL AND order_id IS NULL)),
  CONSTRAINT "payment_intent_ck2" CHECK (expected_minor > 0),
  CONSTRAINT "payment_intent_ck3" CHECK (currency = 'KZT'),
  CONSTRAINT "payment_intent_ck4" CHECK (environment IN ('simulation','sandbox'))
);
COMMENT ON TABLE "payment_intent" IS 'One payment obligation for an order or event activation; retries belong to attempts.';
COMMENT ON COLUMN "payment_intent"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "payment_intent"."event_id" IS 'Owning event.';
COMMENT ON COLUMN "payment_intent"."order_id" IS 'Order payment target.';
COMMENT ON COLUMN "payment_intent"."activation_id" IS 'Activation payment target, exclusive with order.';
COMMENT ON COLUMN "payment_intent"."purpose" IS 'ticket_order or activation.';
COMMENT ON COLUMN "payment_intent"."expected_minor" IS 'Expected charge, positive.';
COMMENT ON COLUMN "payment_intent"."currency" IS 'Currency snapshot.';
COMMENT ON COLUMN "payment_intent"."environment" IS 'simulation or sandbox; live outside this design baseline.';
COMMENT ON COLUMN "payment_intent"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "payment_attempt" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "intent_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "environment" text NOT NULL,
  "provider" text NOT NULL,
  "merchant_account_key" text NOT NULL,
  "provider_payment_id" text,
  "request_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'created',
  "charged_minor" bigint NOT NULL DEFAULT 0,
  "processing_fee_minor" bigint NOT NULL DEFAULT 0,
  "confirmed_at" timestamptz,
  "next_reconcile_at" timestamptz,
  "safe_result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_attempt_pk" PRIMARY KEY (id),
  CONSTRAINT "payment_attempt_uq1" UNIQUE ("provider", "environment", "merchant_account_key", "provider_payment_id"),
  CONSTRAINT "payment_attempt_uq2" UNIQUE ("provider", "environment", "merchant_account_key", "request_key"),
  CONSTRAINT "payment_attempt_uq3" UNIQUE ("id", "event_id"),
  CONSTRAINT "payment_attempt_ck1" CHECK (status IN ('created','pending','succeeded','failed')),
  CONSTRAINT "payment_attempt_ck2" CHECK (charged_minor >= 0 AND processing_fee_minor BETWEEN 0 AND charged_minor),
  CONSTRAINT "payment_attempt_ck3" CHECK ((status = 'succeeded') = (confirmed_at IS NOT NULL)),
  CONSTRAINT "payment_attempt_ck4" CHECK (status <> 'succeeded' OR charged_minor > 0),
  CONSTRAINT "payment_attempt_ck5" CHECK (jsonb_typeof(safe_result) = 'object')
);
COMMENT ON TABLE "payment_attempt" IS 'Provider attempts preserve even duplicate successful charges; fulfillment chooses only one.';
COMMENT ON COLUMN "payment_attempt"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "payment_attempt"."intent_id" IS 'Obligation.';
COMMENT ON COLUMN "payment_attempt"."event_id" IS 'Scope.';
COMMENT ON COLUMN "payment_attempt"."environment" IS 'Must equal intent environment.';
COMMENT ON COLUMN "payment_attempt"."provider" IS 'simulator or selected sandbox provider.';
COMMENT ON COLUMN "payment_attempt"."merchant_account_key" IS 'Nonsecret provider-account discriminator.';
COMMENT ON COLUMN "payment_attempt"."provider_payment_id" IS 'Provider transaction ID when known.';
COMMENT ON COLUMN "payment_attempt"."request_key" IS 'Stable outbound idempotency key.';
COMMENT ON COLUMN "payment_attempt"."status" IS 'created, pending, succeeded or failed.';
COMMENT ON COLUMN "payment_attempt"."charged_minor" IS 'Actual confirmed charge.';
COMMENT ON COLUMN "payment_attempt"."processing_fee_minor" IS 'Actual/simulated fee.';
COMMENT ON COLUMN "payment_attempt"."confirmed_at" IS 'Authoritative success time.';
COMMENT ON COLUMN "payment_attempt"."next_reconcile_at" IS 'Pending/uncertain reconciliation schedule.';
COMMENT ON COLUMN "payment_attempt"."safe_result" IS 'Allowlisted result fields only.';
COMMENT ON COLUMN "payment_attempt"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "provider_event" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "provider" text NOT NULL,
  "environment" text NOT NULL,
  "merchant_account_key" text NOT NULL,
  "external_event_id" text NOT NULL,
  "payment_attempt_id" uuid,
  "refund_attempt_id" uuid,
  "payload_hash" text NOT NULL,
  "safe_payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'received',
  "processed_at" timestamptz,
  "rejection_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_event_pk" PRIMARY KEY (id),
  CONSTRAINT "provider_event_uq1" UNIQUE ("provider", "environment", "merchant_account_key", "external_event_id"),
  CONSTRAINT "provider_event_ck1" CHECK (environment IN ('simulation','sandbox')),
  CONSTRAINT "provider_event_ck2" CHECK (status IN ('received','processed','rejected')),
  CONSTRAINT "provider_event_ck3" CHECK (num_nonnulls(payment_attempt_id,refund_attempt_id) <= 1),
  CONSTRAINT "provider_event_ck4" CHECK (jsonb_typeof(safe_payload) = 'object'),
  CONSTRAINT "provider_event_ck5" CHECK (status <> 'processed' OR processed_at IS NOT NULL)
);
COMMENT ON TABLE "provider_event" IS 'Verified callback inbox; save received and processed times independently.';
COMMENT ON COLUMN "provider_event"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "provider_event"."provider" IS 'Source adapter.';
COMMENT ON COLUMN "provider_event"."environment" IS 'simulation or sandbox.';
COMMENT ON COLUMN "provider_event"."merchant_account_key" IS 'Nonsecret account scope.';
COMMENT ON COLUMN "provider_event"."external_event_id" IS 'Provider event ID or stable adapter-derived fingerprint.';
COMMENT ON COLUMN "provider_event"."payment_attempt_id" IS 'Resolved payment attempt.';
COMMENT ON COLUMN "provider_event"."refund_attempt_id" IS 'Resolved refund attempt.';
COMMENT ON COLUMN "provider_event"."payload_hash" IS 'Digest to detect same ID with altered data.';
COMMENT ON COLUMN "provider_event"."safe_payload" IS 'Validated allowlist, no card/token secrets.';
COMMENT ON COLUMN "provider_event"."status" IS 'received, processed or rejected.';
COMMENT ON COLUMN "provider_event"."processed_at" IS 'Business effects committed with this timestamp.';
COMMENT ON COLUMN "provider_event"."rejection_reason" IS 'Safe diagnosis.';
COMMENT ON COLUMN "provider_event"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "payout_profile" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "environment" text NOT NULL DEFAULT 'simulation',
  "provider" text NOT NULL,
  "provider_reference" text,
  "encrypted_details" bytea,
  "status" text NOT NULL DEFAULT 'pending',
  "verified_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payout_profile_pk" PRIMARY KEY (id),
  CONSTRAINT "payout_profile_uq1" UNIQUE ("id", "organization_id"),
  CONSTRAINT "payout_profile_ck1" CHECK (environment IN ('simulation','sandbox')),
  CONSTRAINT "payout_profile_ck2" CHECK (status IN ('pending','verified','rejected')),
  CONSTRAINT "payout_profile_ck3" CHECK (status <> 'verified' OR verified_at IS NOT NULL)
);
COMMENT ON TABLE "payout_profile" IS 'Protected organizer payout destination; simulator reference or encrypted sandbox profile.';
COMMENT ON COLUMN "payout_profile"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "payout_profile"."organization_id" IS 'Owner.';
COMMENT ON COLUMN "payout_profile"."environment" IS 'simulation or sandbox.';
COMMENT ON COLUMN "payout_profile"."provider" IS 'Profile adapter.';
COMMENT ON COLUMN "payout_profile"."provider_reference" IS 'Provider token/reference; not card details.';
COMMENT ON COLUMN "payout_profile"."encrypted_details" IS 'Encrypted payout metadata, if needed.';
COMMENT ON COLUMN "payout_profile"."status" IS 'pending, verified or rejected.';
COMMENT ON COLUMN "payout_profile"."verified_at" IS 'Verification time.';
COMMENT ON COLUMN "payout_profile"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "verification_record" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "submitted_by_user_id" uuid NOT NULL,
  "reviewed_by_user_id" uuid,
  "environment" text NOT NULL DEFAULT 'simulation',
  "status" text NOT NULL DEFAULT 'pending',
  "reviewed_at" timestamptz,
  "reason" text,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "verification_record_pk" PRIMARY KEY (id),
  CONSTRAINT "verification_record_uq1" UNIQUE ("id", "organization_id"),
  CONSTRAINT "verification_record_ck1" CHECK (environment IN ('simulation','sandbox')),
  CONSTRAINT "verification_record_ck2" CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT "verification_record_ck3" CHECK (status = 'pending' OR reviewed_at IS NOT NULL)
);
COMMENT ON TABLE "verification_record" IS 'Retained demo/sandbox identity decisions; no production KYC documents.';
COMMENT ON COLUMN "verification_record"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "verification_record"."organization_id" IS 'Applicant.';
COMMENT ON COLUMN "verification_record"."submitted_by_user_id" IS 'Submitting actor.';
COMMENT ON COLUMN "verification_record"."reviewed_by_user_id" IS 'Platform reviewer, NULL for simulator.';
COMMENT ON COLUMN "verification_record"."environment" IS 'simulation or sandbox.';
COMMENT ON COLUMN "verification_record"."status" IS 'pending, approved or rejected.';
COMMENT ON COLUMN "verification_record"."reviewed_at" IS 'Decision timestamp.';
COMMENT ON COLUMN "verification_record"."reason" IS 'Safe decision explanation.';
COMMENT ON COLUMN "verification_record"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "terms_acceptance" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "accepted_by_user_id" uuid NOT NULL,
  "terms_version" text NOT NULL,
  "terms_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "terms_acceptance_pk" PRIMARY KEY (id),
  CONSTRAINT "terms_acceptance_uq1" UNIQUE ("event_id", "terms_version", "accepted_by_user_id"),
  CONSTRAINT "terms_acceptance_uq2" UNIQUE ("id", "event_id")
);
COMMENT ON TABLE "terms_acceptance" IS 'Immutable evidence of event paid-terms acceptance.';
COMMENT ON COLUMN "terms_acceptance"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "terms_acceptance"."event_id" IS 'Event.';
COMMENT ON COLUMN "terms_acceptance"."accepted_by_user_id" IS 'Authorized actor.';
COMMENT ON COLUMN "terms_acceptance"."terms_version" IS 'Version identifier.';
COMMENT ON COLUMN "terms_acceptance"."terms_hash" IS 'Digest of exact accepted terms.';
COMMENT ON COLUMN "terms_acceptance"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "sales_activation" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "payout_profile_id" uuid,
  "verification_record_id" uuid,
  "terms_acceptance_id" uuid,
  "status" text NOT NULL DEFAULT 'incomplete',
  "activation_fee_minor" bigint NOT NULL DEFAULT 500000,
  "currency" text NOT NULL DEFAULT 'KZT',
  "paid_attempt_id" uuid,
  "activated_at" timestamptz,
  "suspension_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_activation_pk" PRIMARY KEY (id),
  CONSTRAINT "sales_activation_uq1" UNIQUE ("event_id"),
  CONSTRAINT "sales_activation_uq2" UNIQUE ("paid_attempt_id"),
  CONSTRAINT "sales_activation_uq3" UNIQUE ("id", "event_id"),
  CONSTRAINT "sales_activation_ck1" CHECK (status IN ('incomplete','pending','active','failed','suspended')),
  CONSTRAINT "sales_activation_ck2" CHECK (activation_fee_minor > 0 AND currency = 'KZT'),
  CONSTRAINT "sales_activation_ck3" CHECK (status <> 'active' OR (payout_profile_id IS NOT NULL AND verification_record_id IS NOT NULL AND terms_acceptance_id IS NOT NULL AND paid_attempt_id IS NOT NULL AND activated_at IS NOT NULL))
);
COMMENT ON TABLE "sales_activation" IS 'Event-level checklist and paid-sales gate.';
COMMENT ON COLUMN "sales_activation"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "sales_activation"."event_id" IS 'One activation per event.';
COMMENT ON COLUMN "sales_activation"."organization_id" IS 'Must match event organization.';
COMMENT ON COLUMN "sales_activation"."payout_profile_id" IS 'Verified destination in same organization.';
COMMENT ON COLUMN "sales_activation"."verification_record_id" IS 'Approved decision in same organization.';
COMMENT ON COLUMN "sales_activation"."terms_acceptance_id" IS 'Acceptance for same event.';
COMMENT ON COLUMN "sales_activation"."status" IS 'incomplete, pending, active, failed or suspended.';
COMMENT ON COLUMN "sales_activation"."activation_fee_minor" IS 'Demo KZT 5,000 in minor units.';
COMMENT ON COLUMN "sales_activation"."currency" IS 'Saved fee currency.';
COMMENT ON COLUMN "sales_activation"."paid_attempt_id" IS 'Chosen successful activation charge.';
COMMENT ON COLUMN "sales_activation"."activated_at" IS 'First activation success.';
COMMENT ON COLUMN "sales_activation"."suspension_reason" IS 'Reason for paid-sales suspension.';
COMMENT ON COLUMN "sales_activation"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "campaign" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "name" text NOT NULL,
  "discount_kind" text NOT NULL,
  "percentage_bps" integer,
  "fixed_minor" bigint,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "max_redemptions" integer NOT NULL,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "all_ticket_types" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaign_pk" PRIMARY KEY (id),
  CONSTRAINT "campaign_uq1" UNIQUE ("id", "event_id"),
  CONSTRAINT "campaign_ck1" CHECK ((discount_kind = 'percentage' AND percentage_bps BETWEEN 1 AND 10000 AND percentage_bps IS NOT NULL AND fixed_minor IS NULL) OR (discount_kind = 'fixed' AND fixed_minor > 0 AND fixed_minor IS NOT NULL AND percentage_bps IS NULL)),
  CONSTRAINT "campaign_ck2" CHECK (ends_at > starts_at AND max_redemptions > 0)
);
COMMENT ON TABLE "campaign" IS 'One discount definition per event; edits do not rewrite purchased snapshots.';
COMMENT ON COLUMN "campaign"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "campaign"."event_id" IS 'Campaign event.';
COMMENT ON COLUMN "campaign"."name" IS 'Organizer label.';
COMMENT ON COLUMN "campaign"."discount_kind" IS 'percentage or fixed.';
COMMENT ON COLUMN "campaign"."percentage_bps" IS '1..10000 basis points for percentage.';
COMMENT ON COLUMN "campaign"."fixed_minor" IS 'Positive fixed KZT discount.';
COMMENT ON COLUMN "campaign"."starts_at" IS 'Validity opening.';
COMMENT ON COLUMN "campaign"."ends_at" IS 'Validity closing.';
COMMENT ON COLUMN "campaign"."max_redemptions" IS 'Lifetime successful-order limit.';
COMMENT ON COLUMN "campaign"."is_enabled" IS 'Rechecked at fulfillment.';
COMMENT ON COLUMN "campaign"."all_ticket_types" IS 'False requires eligible join rows.';
COMMENT ON COLUMN "campaign"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "campaign_ticket_type" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "ticket_type_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaign_ticket_type_pk" PRIMARY KEY (id),
  CONSTRAINT "campaign_ticket_type_uq1" UNIQUE ("campaign_id", "ticket_type_id")
);
COMMENT ON TABLE "campaign_ticket_type" IS 'Eligible ticket types; composite FKs prevent cross-event discounts.';
COMMENT ON COLUMN "campaign_ticket_type"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "campaign_ticket_type"."event_id" IS 'Scope.';
COMMENT ON COLUMN "campaign_ticket_type"."campaign_id" IS 'Campaign.';
COMMENT ON COLUMN "campaign_ticket_type"."ticket_type_id" IS 'Eligible type in same event.';
COMMENT ON COLUMN "campaign_ticket_type"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "promo_code" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "code_normalized" text NOT NULL,
  "link_token_hash" text NOT NULL,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promo_code_pk" PRIMARY KEY (id),
  CONSTRAINT "promo_code_uq1" UNIQUE ("code_normalized"),
  CONSTRAINT "promo_code_uq2" UNIQUE ("link_token_hash"),
  CONSTRAINT "promo_code_uq3" UNIQUE ("id", "event_id", "campaign_id"),
  CONSTRAINT "promo_code_ck1" CHECK (code_normalized = upper(btrim(code_normalized)))
);
COMMENT ON TABLE "promo_code" IS 'Human code and separate opaque campaign-link token.';
COMMENT ON COLUMN "promo_code"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "promo_code"."event_id" IS 'Scope.';
COMMENT ON COLUMN "promo_code"."campaign_id" IS 'Campaign.';
COMMENT ON COLUMN "promo_code"."code_normalized" IS 'Unique uppercase code.';
COMMENT ON COLUMN "promo_code"."link_token_hash" IS 'Opaque campaign-link digest; different purpose from ticket.';
COMMENT ON COLUMN "promo_code"."is_enabled" IS 'Code-level switch.';
COMMENT ON COLUMN "promo_code"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "promo_reservation" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "promo_code_id" uuid NOT NULL,
  "hold_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "expires_at" timestamptz NOT NULL,
  "discount_snapshot" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promo_reservation_pk" PRIMARY KEY (id),
  CONSTRAINT "promo_reservation_uq1" UNIQUE ("id", "event_id", "campaign_id"),
  CONSTRAINT "promo_reservation_ck1" CHECK (status IN ('active','consumed','released')),
  CONSTRAINT "promo_reservation_ck2" CHECK (expires_at > created_at),
  CONSTRAINT "promo_reservation_ck3" CHECK (jsonb_typeof(discount_snapshot) = 'object')
);
COMMENT ON TABLE "promo_reservation" IS 'One active redemption allowance per hold; released/consumed history retained.';
COMMENT ON COLUMN "promo_reservation"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "promo_reservation"."event_id" IS 'Scope.';
COMMENT ON COLUMN "promo_reservation"."campaign_id" IS 'Campaign lock protects lifetime limit.';
COMMENT ON COLUMN "promo_reservation"."promo_code_id" IS 'Code in same campaign/event.';
COMMENT ON COLUMN "promo_reservation"."hold_id" IS 'Inventory hold in same event.';
COMMENT ON COLUMN "promo_reservation"."status" IS 'active, consumed or released.';
COMMENT ON COLUMN "promo_reservation"."expires_at" IS 'No later than hold expiry.';
COMMENT ON COLUMN "promo_reservation"."discount_snapshot" IS 'Versioned exact discount definition used in quote.';
COMMENT ON COLUMN "promo_reservation"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "promo_redemption" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "reservation_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "discount_minor" bigint NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promo_redemption_pk" PRIMARY KEY (id),
  CONSTRAINT "promo_redemption_uq1" UNIQUE ("order_id"),
  CONSTRAINT "promo_redemption_uq2" UNIQUE ("reservation_id"),
  CONSTRAINT "promo_redemption_ck1" CHECK (discount_minor >= 0)
);
COMMENT ON TABLE "promo_redemption" IS 'Immutable successful-order attribution; refund never deletes/replenishes it.';
COMMENT ON COLUMN "promo_redemption"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "promo_redemption"."event_id" IS 'Scope.';
COMMENT ON COLUMN "promo_redemption"."campaign_id" IS 'Campaign.';
COMMENT ON COLUMN "promo_redemption"."reservation_id" IS 'Consumed allowance.';
COMMENT ON COLUMN "promo_redemption"."order_id" IS 'One redemption per order.';
COMMENT ON COLUMN "promo_redemption"."discount_minor" IS 'Sum of order item discount allocations.';
COMMENT ON COLUMN "promo_redemption"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "ticket" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "order_item_id" uuid NOT NULL,
  "recipient_user_id" uuid,
  "status" text NOT NULL DEFAULT 'valid',
  "qr_token_hash" text NOT NULL,
  "token_version" integer NOT NULL DEFAULT 1,
  "claimed_at" timestamptz,
  "issued_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pdf_file_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_pk" PRIMARY KEY (id),
  CONSTRAINT "ticket_uq1" UNIQUE ("order_item_id"),
  CONSTRAINT "ticket_uq2" UNIQUE ("qr_token_hash"),
  CONSTRAINT "ticket_uq3" UNIQUE ("id", "event_id"),
  CONSTRAINT "ticket_uq4" UNIQUE ("id", "event_id", "recipient_user_id"),
  CONSTRAINT "ticket_ck1" CHECK (status IN ('valid','checked_in','refund_pending','refunded','cancelled')),
  CONSTRAINT "ticket_ck2" CHECK (token_version > 0),
  CONSTRAINT "ticket_ck3" CHECK ((recipient_user_id IS NULL) = (claimed_at IS NULL))
);
COMMENT ON TABLE "ticket" IS 'One canonical ticket per unit; buyer and recipient are distinct.';
COMMENT ON COLUMN "ticket"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "ticket"."event_id" IS 'Scope.';
COMMENT ON COLUMN "ticket"."order_item_id" IS 'One purchased admission unit.';
COMMENT ON COLUMN "ticket"."recipient_user_id" IS 'Unclaimed until intended email verified.';
COMMENT ON COLUMN "ticket"."status" IS 'valid, checked_in, refund_pending, refunded or cancelled.';
COMMENT ON COLUMN "ticket"."qr_token_hash" IS 'Purpose-bound ticket token digest.';
COMMENT ON COLUMN "ticket"."token_version" IS 'Signing/token revision, not a new admission.';
COMMENT ON COLUMN "ticket"."claimed_at" IS 'Recipient association time.';
COMMENT ON COLUMN "ticket"."issued_at" IS 'Canonical issuance time.';
COMMENT ON COLUMN "ticket"."pdf_file_id" IS 'Protected printable rendering.';
COMMENT ON COLUMN "ticket"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "ticket_claim" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "ticket_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "consumed_by_user_id" uuid,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_claim_pk" PRIMARY KEY (id),
  CONSTRAINT "ticket_claim_uq1" UNIQUE ("token_hash"),
  CONSTRAINT "ticket_claim_ck1" CHECK (expires_at > created_at),
  CONSTRAINT "ticket_claim_ck2" CHECK ((consumed_at IS NULL) = (consumed_by_user_id IS NULL))
);
COMMENT ON TABLE "ticket_claim" IS 'Expiring claim challenge; intended email comes from immutable order item.';
COMMENT ON COLUMN "ticket_claim"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "ticket_claim"."ticket_id" IS 'Ticket to claim.';
COMMENT ON COLUMN "ticket_claim"."token_hash" IS 'Digest, not raw claim secret.';
COMMENT ON COLUMN "ticket_claim"."expires_at" IS 'Expiry.';
COMMENT ON COLUMN "ticket_claim"."consumed_at" IS 'Single successful use.';
COMMENT ON COLUMN "ticket_claim"."consumed_by_user_id" IS 'Verified intended recipient.';
COMMENT ON COLUMN "ticket_claim"."revoked_at" IS 'Explicitly close expired/replaced claim before inserting another.';
COMMENT ON COLUMN "ticket_claim"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "entry_confirmation" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "ticket_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "attendee_user_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "signing_key_id" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entry_confirmation_pk" PRIMARY KEY (id),
  CONSTRAINT "entry_confirmation_uq1" UNIQUE ("token_hash"),
  CONSTRAINT "entry_confirmation_uq2" UNIQUE ("id", "ticket_id", "event_id"),
  CONSTRAINT "entry_confirmation_ck1" CHECK (expires_at > created_at)
);
COMMENT ON TABLE "entry_confirmation" IS 'Short-lived signed-in attendee proof; separate from printed ticket identity.';
COMMENT ON COLUMN "entry_confirmation"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "entry_confirmation"."ticket_id" IS 'Claimed ticket.';
COMMENT ON COLUMN "entry_confirmation"."event_id" IS 'Same event.';
COMMENT ON COLUMN "entry_confirmation"."attendee_user_id" IS 'Must equal ticket recipient.';
COMMENT ON COLUMN "entry_confirmation"."session_id" IS 'Session belongs to attendee.';
COMMENT ON COLUMN "entry_confirmation"."token_hash" IS 'Purpose-bound one-time confirmation digest.';
COMMENT ON COLUMN "entry_confirmation"."signing_key_id" IS 'Public verification key identifier for offline package.';
COMMENT ON COLUMN "entry_confirmation"."expires_at" IS 'Short validity; not later than session.';
COMMENT ON COLUMN "entry_confirmation"."consumed_at" IS 'Set atomically with authoritative admission.';
COMMENT ON COLUMN "entry_confirmation"."revoked_at" IS 'Optional explicit cancellation.';
COMMENT ON COLUMN "entry_confirmation"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "scanner_device" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" uuid NOT NULL,
  "device_key" text NOT NULL,
  "label" text NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scanner_device_pk" PRIMARY KEY (id),
  CONSTRAINT "scanner_device_uq1" UNIQUE ("device_key"),
  CONSTRAINT "scanner_device_uq2" UNIQUE ("id", "owner_user_id")
);
COMMENT ON TABLE "scanner_device" IS 'Registered scanner installation, owned by one account; event permissions checked separately.';
COMMENT ON COLUMN "scanner_device"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "scanner_device"."owner_user_id" IS 'Scanner account.';
COMMENT ON COLUMN "scanner_device"."device_key" IS 'Installation identifier, not a secret bearer credential.';
COMMENT ON COLUMN "scanner_device"."label" IS 'Operator-readable name.';
COMMENT ON COLUMN "scanner_device"."revoked_at" IS 'Device authorization stop.';
COMMENT ON COLUMN "scanner_device"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "check_in" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "ticket_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "entry_confirmation_id" uuid NOT NULL,
  "scanner_user_id" uuid NOT NULL,
  "scanner_session_id" uuid NOT NULL,
  "device_id" uuid NOT NULL,
  "operation_id" uuid NOT NULL,
  "source" text NOT NULL,
  "accepted_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "captured_at" timestamptz NOT NULL,
  "reversed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "check_in_pk" PRIMARY KEY (id),
  CONSTRAINT "check_in_uq1" UNIQUE ("device_id", "operation_id"),
  CONSTRAINT "check_in_uq2" UNIQUE ("entry_confirmation_id"),
  CONSTRAINT "check_in_uq3" UNIQUE ("id", "ticket_id", "event_id"),
  CONSTRAINT "check_in_ck1" CHECK (source IN ('online','offline_sync'))
);
COMMENT ON TABLE "check_in" IS 'Append-preserved accepted admission; current state represented by reversed_at.';
COMMENT ON COLUMN "check_in"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "check_in"."ticket_id" IS 'Canonical ticket.';
COMMENT ON COLUMN "check_in"."event_id" IS 'Same event.';
COMMENT ON COLUMN "check_in"."entry_confirmation_id" IS 'Consumed attendee confirmation.';
COMMENT ON COLUMN "check_in"."scanner_user_id" IS 'Authorized scanner at operation time.';
COMMENT ON COLUMN "check_in"."scanner_session_id" IS 'Session belongs to scanner.';
COMMENT ON COLUMN "check_in"."device_id" IS 'Device belongs to scanner.';
COMMENT ON COLUMN "check_in"."operation_id" IS 'Client retry/deduplication ID.';
COMMENT ON COLUMN "check_in"."source" IS 'online or offline_sync.';
COMMENT ON COLUMN "check_in"."accepted_at" IS 'Server acceptance time.';
COMMENT ON COLUMN "check_in"."captured_at" IS 'Device observation, not conflict priority.';
COMMENT ON COLUMN "check_in"."reversed_at" IS 'Materialized current-admission flag; written with reversal row.';
COMMENT ON COLUMN "check_in"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "check_in_reversal" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "check_in_id" uuid NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "check_in_reversal_pk" PRIMARY KEY (id),
  CONSTRAINT "check_in_reversal_uq1" UNIQUE ("check_in_id"),
  CONSTRAINT "check_in_reversal_ck1" CHECK (length(btrim(reason)) > 0)
);
COMMENT ON TABLE "check_in_reversal" IS 'One retained reversal for an accepted admission; never erase original row.';
COMMENT ON COLUMN "check_in_reversal"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "check_in_reversal"."check_in_id" IS 'Admission being reversed.';
COMMENT ON COLUMN "check_in_reversal"."actor_user_id" IS 'Authorized reversal actor.';
COMMENT ON COLUMN "check_in_reversal"."reason" IS 'Mandatory explanation.';
COMMENT ON COLUMN "check_in_reversal"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "refund" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "payment_attempt_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'requested',
  "amount_minor" bigint NOT NULL,
  "requested_by_user_id" uuid,
  "approved_by_user_id" uuid,
  "succeeded_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_pk" PRIMARY KEY (id),
  CONSTRAINT "refund_uq1" UNIQUE ("payment_attempt_id"),
  CONSTRAINT "refund_uq2" UNIQUE ("id", "event_id"),
  CONSTRAINT "refund_ck1" CHECK (reason IN ('voluntary','event_cancelled','late_payment','duplicate_charge','blocked_fulfillment')),
  CONSTRAINT "refund_ck2" CHECK (status IN ('requested','pending','failed','succeeded')),
  CONSTRAINT "refund_ck3" CHECK (amount_minor > 0),
  CONSTRAINT "refund_ck4" CHECK ((status = 'succeeded') = (succeeded_at IS NOT NULL))
);
COMMENT ON TABLE "refund" IS 'One full refund obligation per successful charge, including compensating duplicate/late charges.';
COMMENT ON COLUMN "refund"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "refund"."payment_attempt_id" IS 'Exactly one charged attempt.';
COMMENT ON COLUMN "refund"."event_id" IS 'Scope.';
COMMENT ON COLUMN "refund"."reason" IS 'voluntary, event_cancelled, late_payment, duplicate_charge or blocked_fulfillment.';
COMMENT ON COLUMN "refund"."status" IS 'requested, pending, failed or succeeded.';
COMMENT ON COLUMN "refund"."amount_minor" IS 'Full amount of referenced actual charge.';
COMMENT ON COLUMN "refund"."requested_by_user_id" IS 'NULL for background compensation/cancellation worker.';
COMMENT ON COLUMN "refund"."approved_by_user_id" IS 'Authorized approver; NULL for system policy.';
COMMENT ON COLUMN "refund"."succeeded_at" IS 'Authoritative refund completion, not request acceptance.';
COMMENT ON COLUMN "refund"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "refund_attempt" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "refund_id" uuid NOT NULL,
  "attempt_number" integer NOT NULL,
  "provider_refund_id" text,
  "provider_request_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "sent_at" timestamptz,
  "resolved_at" timestamptz,
  "safe_result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_attempt_pk" PRIMARY KEY (id),
  CONSTRAINT "refund_attempt_uq1" UNIQUE ("refund_id", "attempt_number"),
  CONSTRAINT "refund_attempt_ck1" CHECK (attempt_number > 0),
  CONSTRAINT "refund_attempt_ck2" CHECK (status IN ('pending','succeeded','failed','unknown')),
  CONSTRAINT "refund_attempt_ck3" CHECK (jsonb_typeof(safe_result) = 'object')
);
COMMENT ON TABLE "refund_attempt" IS 'Transport attempts for the same logical refund. Uncertain outcome reconciles before resend.';
COMMENT ON COLUMN "refund_attempt"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "refund_attempt"."refund_id" IS 'Obligation.';
COMMENT ON COLUMN "refund_attempt"."attempt_number" IS 'Sequence.';
COMMENT ON COLUMN "refund_attempt"."provider_refund_id" IS 'Provider refund operation reference.';
COMMENT ON COLUMN "refund_attempt"."provider_request_key" IS 'Same logical refund key across transport retries.';
COMMENT ON COLUMN "refund_attempt"."status" IS 'pending, succeeded, failed or unknown.';
COMMENT ON COLUMN "refund_attempt"."sent_at" IS 'External send time.';
COMMENT ON COLUMN "refund_attempt"."resolved_at" IS 'Known terminal outcome.';
COMMENT ON COLUMN "refund_attempt"."safe_result" IS 'Allowlisted provider response.';
COMMENT ON COLUMN "refund_attempt"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "demo_payout" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "payout_profile_id" uuid NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL DEFAULT 'KZT',
  "status" text NOT NULL DEFAULT 'pending',
  "request_key" text NOT NULL,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "demo_payout_pk" PRIMARY KEY (id),
  CONSTRAINT "demo_payout_uq1" UNIQUE ("event_id", "request_key"),
  CONSTRAINT "demo_payout_uq2" UNIQUE ("id", "event_id"),
  CONSTRAINT "demo_payout_ck1" CHECK (amount_minor > 0 AND currency = 'KZT'),
  CONSTRAINT "demo_payout_ck2" CHECK (status IN ('pending','eligible','sent','failed')),
  CONSTRAINT "demo_payout_ck3" CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);
COMMENT ON TABLE "demo_payout" IS 'Event-scoped payout simulation; never represents a real bank transfer.';
COMMENT ON COLUMN "demo_payout"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "demo_payout"."event_id" IS 'Event.';
COMMENT ON COLUMN "demo_payout"."organization_id" IS 'Owning workspace.';
COMMENT ON COLUMN "demo_payout"."payout_profile_id" IS 'Profile in same organization.';
COMMENT ON COLUMN "demo_payout"."amount_minor" IS 'Positive reserved payable funds.';
COMMENT ON COLUMN "demo_payout"."currency" IS 'Currency.';
COMMENT ON COLUMN "demo_payout"."status" IS 'pending, eligible, sent or failed.';
COMMENT ON COLUMN "demo_payout"."request_key" IS 'Idempotent logical payout operation.';
COMMENT ON COLUMN "demo_payout"."sent_at" IS 'Successful simulated send.';
COMMENT ON COLUMN "demo_payout"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "finance_entry" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "payment_attempt_id" uuid,
  "refund_id" uuid,
  "demo_payout_id" uuid,
  "kind" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" text NOT NULL DEFAULT 'KZT',
  "environment" text NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_entry_pk" PRIMARY KEY (id),
  CONSTRAINT "finance_entry_uq1" UNIQUE ("payment_attempt_id", "kind"),
  CONSTRAINT "finance_entry_uq2" UNIQUE ("refund_id", "kind"),
  CONSTRAINT "finance_entry_uq3" UNIQUE ("demo_payout_id", "kind"),
  CONSTRAINT "finance_entry_ck1" CHECK (currency = 'KZT' AND environment IN ('simulation','sandbox')),
  CONSTRAINT "finance_entry_ck2" CHECK ((kind IN ('sale','processing_fee','activation_fee') AND payment_attempt_id IS NOT NULL AND refund_id IS NULL AND demo_payout_id IS NULL) OR (kind IN ('refund','fee_reversal','activation_refund') AND refund_id IS NOT NULL AND payment_attempt_id IS NULL AND demo_payout_id IS NULL) OR (kind = 'payout' AND demo_payout_id IS NOT NULL AND payment_attempt_id IS NULL AND refund_id IS NULL)),
  CONSTRAINT "finance_entry_ck3" CHECK ((kind IN ('sale','fee_reversal','activation_refund') AND amount_minor >= 0) OR (kind IN ('processing_fee','activation_fee','refund','payout') AND amount_minor <= 0))
);
COMMENT ON TABLE "finance_entry" IS 'Append-only signed organizer balance effects; not a production accounting ledger.';
COMMENT ON COLUMN "finance_entry"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "finance_entry"."event_id" IS 'Event balance scope.';
COMMENT ON COLUMN "finance_entry"."payment_attempt_id" IS 'Source sale, processing fee or activation payment.';
COMMENT ON COLUMN "finance_entry"."refund_id" IS 'Source refund or fee reversal.';
COMMENT ON COLUMN "finance_entry"."demo_payout_id" IS 'Source simulated payout debit.';
COMMENT ON COLUMN "finance_entry"."kind" IS 'sale, processing_fee, activation_fee, refund, fee_reversal, activation_refund or payout.';
COMMENT ON COLUMN "finance_entry"."amount_minor" IS 'Signed effect; credits positive, debits negative.';
COMMENT ON COLUMN "finance_entry"."currency" IS 'KZT.';
COMMENT ON COLUMN "finance_entry"."environment" IS 'simulation or sandbox.';
COMMENT ON COLUMN "finance_entry"."effective_at" IS 'Business recognition timestamp.';
COMMENT ON COLUMN "finance_entry"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "offline_package" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "scanner_user_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "device_id" uuid NOT NULL,
  "file_id" uuid NOT NULL,
  "snapshot_version" bigint NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "content_hash" text NOT NULL,
  "signing_key_id" text NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offline_package_pk" PRIMARY KEY (id),
  CONSTRAINT "offline_package_uq1" UNIQUE ("id", "event_id", "device_id"),
  CONSTRAINT "offline_package_ck1" CHECK (snapshot_version >= 0),
  CONSTRAINT "offline_package_ck2" CHECK (expires_at > created_at)
);
COMMENT ON TABLE "offline_package" IS 'Expiring signed event manifest for a specific scanner device/session.';
COMMENT ON COLUMN "offline_package"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "offline_package"."event_id" IS 'Event.';
COMMENT ON COLUMN "offline_package"."scanner_user_id" IS 'Assigned account at download.';
COMMENT ON COLUMN "offline_package"."session_id" IS 'Scanner session.';
COMMENT ON COLUMN "offline_package"."device_id" IS 'Owned device.';
COMMENT ON COLUMN "offline_package"."file_id" IS 'Protected encrypted manifest object.';
COMMENT ON COLUMN "offline_package"."snapshot_version" IS 'Event availability version used.';
COMMENT ON COLUMN "offline_package"."expires_at" IS 'Package authorization expiry.';
COMMENT ON COLUMN "offline_package"."content_hash" IS 'Manifest integrity digest.';
COMMENT ON COLUMN "offline_package"."signing_key_id" IS 'Manifest verification key.';
COMMENT ON COLUMN "offline_package"."revoked_at" IS 'Online stop; cannot instantly reach disconnected device.';
COMMENT ON COLUMN "offline_package"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "offline_operation" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "package_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "device_id" uuid NOT NULL,
  "operation_id" uuid NOT NULL,
  "sequence_number" bigint NOT NULL,
  "kind" text NOT NULL,
  "claimed_ticket_id" uuid,
  "claimed_confirmation_id" uuid,
  "parent_operation_id" uuid,
  "captured_at" timestamptz NOT NULL,
  "payload_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'received',
  "resolved_ticket_id" uuid,
  "accepted_check_in_id" uuid,
  "rejection_code" text,
  "processed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offline_operation_pk" PRIMARY KEY (id),
  CONSTRAINT "offline_operation_uq1" UNIQUE ("device_id", "operation_id"),
  CONSTRAINT "offline_operation_uq2" UNIQUE ("package_id", "sequence_number"),
  CONSTRAINT "offline_operation_ck1" CHECK (sequence_number > 0),
  CONSTRAINT "offline_operation_ck2" CHECK (kind IN ('check_in','reverse')),
  CONSTRAINT "offline_operation_ck3" CHECK (status IN ('received','accepted','duplicate','rejected','conflict')),
  CONSTRAINT "offline_operation_ck4" CHECK ((kind = 'reverse') = (parent_operation_id IS NOT NULL)),
  CONSTRAINT "offline_operation_ck5" CHECK (status = 'received' OR processed_at IS NOT NULL)
);
COMMENT ON TABLE "offline_operation" IS 'Retained raw client intent and per-operation reconciliation outcome; not authoritative admission.';
COMMENT ON COLUMN "offline_operation"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "offline_operation"."package_id" IS 'Manifest used.';
COMMENT ON COLUMN "offline_operation"."event_id" IS 'Package scope.';
COMMENT ON COLUMN "offline_operation"."device_id" IS 'Package device.';
COMMENT ON COLUMN "offline_operation"."operation_id" IS 'Client-generated stable ID.';
COMMENT ON COLUMN "offline_operation"."sequence_number" IS 'Monotonic within package.';
COMMENT ON COLUMN "offline_operation"."kind" IS 'check_in or reverse.';
COMMENT ON COLUMN "offline_operation"."claimed_ticket_id" IS 'Untrusted supplied ID; intentionally not FK so invalid scans can be retained.';
COMMENT ON COLUMN "offline_operation"."claimed_confirmation_id" IS 'Untrusted reference, not FK.';
COMMENT ON COLUMN "offline_operation"."parent_operation_id" IS 'For reversal: client operation ID being reversed.';
COMMENT ON COLUMN "offline_operation"."captured_at" IS 'Untrusted device time.';
COMMENT ON COLUMN "offline_operation"."payload_hash" IS 'Detect retry with changed content.';
COMMENT ON COLUMN "offline_operation"."status" IS 'received, accepted, duplicate, rejected or conflict.';
COMMENT ON COLUMN "offline_operation"."resolved_ticket_id" IS 'Only valid resolved ticket FK.';
COMMENT ON COLUMN "offline_operation"."accepted_check_in_id" IS 'Accepted or original deduplicated admission.';
COMMENT ON COLUMN "offline_operation"."rejection_code" IS 'Machine-readable result.';
COMMENT ON COLUMN "offline_operation"."processed_at" IS 'Server reconciliation time.';
COMMENT ON COLUMN "offline_operation"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "sync_conflict" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "offline_operation_id" uuid NOT NULL,
  "existing_check_in_id" uuid,
  "status" text NOT NULL DEFAULT 'open',
  "reason" text NOT NULL,
  "resolved_by_user_id" uuid,
  "resolution_note" text,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_conflict_pk" PRIMARY KEY (id),
  CONSTRAINT "sync_conflict_uq1" UNIQUE ("offline_operation_id"),
  CONSTRAINT "sync_conflict_ck1" CHECK (status IN ('open','resolved')),
  CONSTRAINT "sync_conflict_ck2" CHECK (status <> 'resolved' OR (resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL AND resolution_note IS NOT NULL))
);
COMMENT ON TABLE "sync_conflict" IS 'Organizer review of conflicting provisional operation; cannot create a second admission.';
COMMENT ON COLUMN "sync_conflict"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "sync_conflict"."offline_operation_id" IS 'Conflicting upload.';
COMMENT ON COLUMN "sync_conflict"."existing_check_in_id" IS 'Already accepted admission if relevant.';
COMMENT ON COLUMN "sync_conflict"."status" IS 'open or resolved.';
COMMENT ON COLUMN "sync_conflict"."reason" IS 'Conflict explanation.';
COMMENT ON COLUMN "sync_conflict"."resolved_by_user_id" IS 'Authorized reviewer.';
COMMENT ON COLUMN "sync_conflict"."resolution_note" IS 'What actually happened at gate.';
COMMENT ON COLUMN "sync_conflict"."resolved_at" IS 'Review completion.';
COMMENT ON COLUMN "sync_conflict"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "stored_file" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "uploaded_by_user_id" uuid,
  "object_key" text NOT NULL,
  "purpose" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "sha256" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "scanned_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stored_file_pk" PRIMARY KEY (id),
  CONSTRAINT "stored_file_uq1" UNIQUE ("object_key"),
  CONSTRAINT "stored_file_ck1" CHECK (purpose IN ('event_image','ticket_pdf','support_attachment','offline_package')),
  CONSTRAINT "stored_file_ck2" CHECK (status IN ('pending','quarantined','clean','rejected','deleted')),
  CONSTRAINT "stored_file_ck3" CHECK (size_bytes >= 0)
);
COMMENT ON TABLE "stored_file" IS 'Object storage metadata; DB transaction does not pretend to atomically commit remote bytes.';
COMMENT ON COLUMN "stored_file"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "stored_file"."uploaded_by_user_id" IS 'NULL for PDF/manifest worker.';
COMMENT ON COLUMN "stored_file"."object_key" IS 'Private storage locator; never a public permanent URL.';
COMMENT ON COLUMN "stored_file"."purpose" IS 'event_image, ticket_pdf, support_attachment or offline_package.';
COMMENT ON COLUMN "stored_file"."mime_type" IS 'Validated content type.';
COMMENT ON COLUMN "stored_file"."size_bytes" IS 'Verified byte length.';
COMMENT ON COLUMN "stored_file"."sha256" IS 'Integrity digest.';
COMMENT ON COLUMN "stored_file"."status" IS 'pending, quarantined, clean, rejected or deleted.';
COMMENT ON COLUMN "stored_file"."scanned_at" IS 'Required for attachment release.';
COMMENT ON COLUMN "stored_file"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "support_case" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "requester_user_id" uuid NOT NULL,
  "organization_id" uuid,
  "event_id" uuid,
  "order_id" uuid,
  "ticket_id" uuid,
  "case_kind" text NOT NULL,
  "category" text NOT NULL,
  "subject" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "assigned_to_user_id" uuid,
  "escalated_at" timestamptz,
  "resolved_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_case_pk" PRIMARY KEY (id),
  CONSTRAINT "support_case_ck1" CHECK (case_kind IN ('attendee','organizer_platform')),
  CONSTRAINT "support_case_ck2" CHECK (category IN ('delivery','payment','refund','seating','event_info','check_in','account','technical')),
  CONSTRAINT "support_case_ck3" CHECK (status IN ('open','in_progress','waiting_customer','resolved')),
  CONSTRAINT "support_case_ck4" CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
  CONSTRAINT "support_case_ck5" CHECK (order_id IS NULL OR event_id IS NOT NULL),
  CONSTRAINT "support_case_ck6" CHECK (ticket_id IS NULL OR event_id IS NOT NULL),
  CONSTRAINT "support_case_ck7" CHECK (event_id IS NULL OR organization_id IS NOT NULL),
  CONSTRAINT "support_case_ck8" CHECK (case_kind <> 'attendee' OR (event_id IS NOT NULL AND organization_id IS NOT NULL))
);
COMMENT ON TABLE "support_case" IS 'One contextual thread, resolved through current relationships and explicit escalation.';
COMMENT ON COLUMN "support_case"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "support_case"."requester_user_id" IS 'Account that opened case.';
COMMENT ON COLUMN "support_case"."organization_id" IS 'Organizer context/target queue.';
COMMENT ON COLUMN "support_case"."event_id" IS 'Optional accessible event.';
COMMENT ON COLUMN "support_case"."order_id" IS 'Buyer''s order if linked.';
COMMENT ON COLUMN "support_case"."ticket_id" IS 'Recipient''s ticket if linked.';
COMMENT ON COLUMN "support_case"."case_kind" IS 'attendee or organizer_platform.';
COMMENT ON COLUMN "support_case"."category" IS 'delivery, payment, refund, seating, event_info, check_in, account or technical.';
COMMENT ON COLUMN "support_case"."subject" IS 'Short subject.';
COMMENT ON COLUMN "support_case"."status" IS 'open, in_progress, waiting_customer or resolved.';
COMMENT ON COLUMN "support_case"."assigned_to_user_id" IS 'Authorized staff/admin, relationship checked transactionally.';
COMMENT ON COLUMN "support_case"."escalated_at" IS 'Platform access granted for attendee case.';
COMMENT ON COLUMN "support_case"."resolved_at" IS 'Current resolution time; cleared on reopening, history retained.';
COMMENT ON COLUMN "support_case"."updated_at" IS 'Last case change.';
COMMENT ON COLUMN "support_case"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "support_message" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid NOT NULL,
  "author_user_id" uuid NOT NULL,
  "client_message_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_message_pk" PRIMARY KEY (id),
  CONSTRAINT "support_message_uq1" UNIQUE ("case_id", "author_user_id", "client_message_id"),
  CONSTRAINT "support_message_uq2" UNIQUE ("id", "case_id"),
  CONSTRAINT "support_message_ck1" CHECK (length(btrim(body)) > 0)
);
COMMENT ON TABLE "support_message" IS 'Append-only persisted message; delivery/reconnect does not duplicate it.';
COMMENT ON COLUMN "support_message"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "support_message"."case_id" IS 'Thread.';
COMMENT ON COLUMN "support_message"."author_user_id" IS 'Authorized participant at send time.';
COMMENT ON COLUMN "support_message"."client_message_id" IS 'Client retry ID.';
COMMENT ON COLUMN "support_message"."body" IS 'Plain/sanitized text.';
COMMENT ON COLUMN "support_message"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "support_attachment" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid NOT NULL,
  "message_id" uuid NOT NULL,
  "file_id" uuid NOT NULL,
  "original_filename" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_attachment_pk" PRIMARY KEY (id),
  CONSTRAINT "support_attachment_uq1" UNIQUE ("file_id")
);
COMMENT ON TABLE "support_attachment" IS 'Protected attachment belongs to an actual persisted message and its case.';
COMMENT ON COLUMN "support_attachment"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "support_attachment"."case_id" IS 'Scope for protected download.';
COMMENT ON COLUMN "support_attachment"."message_id" IS 'Message in same case.';
COMMENT ON COLUMN "support_attachment"."file_id" IS 'Clean, allowed attachment object.';
COMMENT ON COLUMN "support_attachment"."original_filename" IS 'Display only; never used as filesystem path.';
COMMENT ON COLUMN "support_attachment"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "case_change" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "change_kind" text NOT NULL,
  "before_value" text,
  "after_value" text,
  "reason" text,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_change_pk" PRIMARY KEY (id),
  CONSTRAINT "case_change_ck1" CHECK (change_kind IN ('status','assignment','escalation'))
);
COMMENT ON TABLE "case_change" IS 'Append-only status, assignment, escalation and reopening history.';
COMMENT ON COLUMN "case_change"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "case_change"."case_id" IS 'Thread.';
COMMENT ON COLUMN "case_change"."actor_user_id" IS 'Actor.';
COMMENT ON COLUMN "case_change"."change_kind" IS 'status, assignment or escalation.';
COMMENT ON COLUMN "case_change"."before_value" IS 'Prior scalar value/user ID.';
COMMENT ON COLUMN "case_change"."after_value" IS 'New scalar value/user ID.';
COMMENT ON COLUMN "case_change"."reason" IS 'Explanation.';
COMMENT ON COLUMN "case_change"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "notification" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "recipient_user_id" uuid NOT NULL,
  "event_id" uuid,
  "kind" text NOT NULL,
  "locale" text NOT NULL,
  "deduplication_key" text NOT NULL,
  "safe_payload" jsonb NOT NULL,
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_pk" PRIMARY KEY (id),
  CONSTRAINT "notification_uq1" UNIQUE ("recipient_user_id", "deduplication_key"),
  CONSTRAINT "notification_ck1" CHECK (locale IN ('kk','ru','en')),
  CONSTRAINT "notification_ck2" CHECK (jsonb_typeof(safe_payload) = 'object')
);
COMMENT ON TABLE "notification" IS 'Durable user inbox and email intent; context pointers still require authorization.';
COMMENT ON COLUMN "notification"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "notification"."recipient_user_id" IS 'Recipient.';
COMMENT ON COLUMN "notification"."event_id" IS 'Event context.';
COMMENT ON COLUMN "notification"."kind" IS 'Template/event code.';
COMMENT ON COLUMN "notification"."locale" IS 'Saved delivery locale.';
COMMENT ON COLUMN "notification"."deduplication_key" IS 'Stable business-operation notification key.';
COMMENT ON COLUMN "notification"."safe_payload" IS 'Versioned allowlist; no card/password/session secrets.';
COMMENT ON COLUMN "notification"."read_at" IS 'In-app read state.';
COMMENT ON COLUMN "notification"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "notification_delivery" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "notification_id" uuid NOT NULL,
  "channel" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz,
  "provider_message_id" text,
  "sent_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_delivery_pk" PRIMARY KEY (id),
  CONSTRAINT "notification_delivery_uq1" UNIQUE ("notification_id", "channel"),
  CONSTRAINT "notification_delivery_ck1" CHECK (channel IN ('email','in_app')),
  CONSTRAINT "notification_delivery_ck2" CHECK (status IN ('pending','sent','failed')),
  CONSTRAINT "notification_delivery_ck3" CHECK (attempt_count >= 0),
  CONSTRAINT "notification_delivery_ck4" CHECK (status <> 'sent' OR sent_at IS NOT NULL)
);
COMMENT ON TABLE "notification_delivery" IS 'One logical delivery per channel with retry bookkeeping.';
COMMENT ON COLUMN "notification_delivery"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "notification_delivery"."notification_id" IS 'Message intent.';
COMMENT ON COLUMN "notification_delivery"."channel" IS 'email or in_app.';
COMMENT ON COLUMN "notification_delivery"."status" IS 'pending, sent or failed.';
COMMENT ON COLUMN "notification_delivery"."attempt_count" IS 'Increment on dispatch.';
COMMENT ON COLUMN "notification_delivery"."next_attempt_at" IS 'Retry schedule.';
COMMENT ON COLUMN "notification_delivery"."provider_message_id" IS 'Provider reference.';
COMMENT ON COLUMN "notification_delivery"."sent_at" IS 'Known success.';
COMMENT ON COLUMN "notification_delivery"."last_error" IS 'Redacted diagnostic.';
COMMENT ON COLUMN "notification_delivery"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "outbox_job" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid,
  "kind" text NOT NULL,
  "deduplication_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "available_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_token" uuid,
  "lease_until" timestamptz,
  "completed_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_job_pk" PRIMARY KEY (id),
  CONSTRAINT "outbox_job_uq1" UNIQUE ("deduplication_key"),
  CONSTRAINT "outbox_job_ck1" CHECK (status IN ('pending','leased','done','dead')),
  CONSTRAINT "outbox_job_ck2" CHECK (attempt_count >= 0),
  CONSTRAINT "outbox_job_ck3" CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT "outbox_job_ck4" CHECK ((status = 'leased' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR (status <> 'leased' AND lease_token IS NULL AND lease_until IS NULL)),
  CONSTRAINT "outbox_job_ck5" CHECK (status <> 'done' OR completed_at IS NOT NULL)
);
COMMENT ON TABLE "outbox_job" IS 'Durable job/event saved with business commit; leased for at-least-once delivery.';
COMMENT ON COLUMN "outbox_job"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "outbox_job"."event_id" IS 'Optional event scope.';
COMMENT ON COLUMN "outbox_job"."kind" IS 'email, pdf, refund, reconcile, broadcast, analytics, etc.';
COMMENT ON COLUMN "outbox_job"."deduplication_key" IS 'Unique logical side-effect key.';
COMMENT ON COLUMN "outbox_job"."payload" IS 'Versioned safe IDs/options; no plaintext tokens.';
COMMENT ON COLUMN "outbox_job"."status" IS 'pending, leased, done or dead.';
COMMENT ON COLUMN "outbox_job"."attempt_count" IS 'Attempts.';
COMMENT ON COLUMN "outbox_job"."available_at" IS 'Next eligible run.';
COMMENT ON COLUMN "outbox_job"."lease_token" IS 'Worker fencing token.';
COMMENT ON COLUMN "outbox_job"."lease_until" IS 'Crash recovery deadline.';
COMMENT ON COLUMN "outbox_job"."completed_at" IS 'Success time.';
COMMENT ON COLUMN "outbox_job"."last_error" IS 'Redacted error.';
COMMENT ON COLUMN "outbox_job"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "idempotency_record" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" uuid NOT NULL,
  "operation" text NOT NULL,
  "request_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "response_code" integer NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_record_pk" PRIMARY KEY (id),
  CONSTRAINT "idempotency_record_uq1" UNIQUE ("actor_user_id", "operation", "request_key"),
  CONSTRAINT "idempotency_record_ck1" CHECK (response_code BETWEEN 200 AND 299),
  CONSTRAINT "idempotency_record_ck2" CHECK (expires_at > created_at)
);
COMMENT ON TABLE "idempotency_record" IS 'Request deduplication; commit result with business effect, never cache auth bypass.';
COMMENT ON COLUMN "idempotency_record"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "idempotency_record"."actor_user_id" IS 'Authenticated actor; provider callbacks have separate inbox.';
COMMENT ON COLUMN "idempotency_record"."operation" IS 'Endpoint/business action namespace.';
COMMENT ON COLUMN "idempotency_record"."request_key" IS 'Client key.';
COMMENT ON COLUMN "idempotency_record"."request_hash" IS 'Canonical payload digest.';
COMMENT ON COLUMN "idempotency_record"."resource_type" IS 'Result entity type, informational not a polymorphic FK.';
COMMENT ON COLUMN "idempotency_record"."resource_id" IS 'Result entity ID; returned only after current authorization.';
COMMENT ON COLUMN "idempotency_record"."response_code" IS 'Original successful response code.';
COMMENT ON COLUMN "idempotency_record"."expires_at" IS 'Retention deadline; irreversible entities retain independent unique keys.';
COMMENT ON COLUMN "idempotency_record"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "audit_log" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid,
  "organization_id" uuid,
  "actor_user_id" uuid,
  "service_actor" text,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "description" text NOT NULL,
  "safe_change" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "correlation_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_log_pk" PRIMARY KEY (id),
  CONSTRAINT "audit_log_ck1" CHECK (num_nonnulls(actor_user_id,service_actor) = 1),
  CONSTRAINT "audit_log_ck2" CHECK (jsonb_typeof(safe_change) = 'object'),
  CONSTRAINT "audit_log_ck3" CHECK (event_id IS NULL OR organization_id IS NOT NULL)
);
COMMENT ON TABLE "audit_log" IS 'Append-only authorized activity timeline; immutable safe entity snapshots.';
COMMENT ON COLUMN "audit_log"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "audit_log"."event_id" IS 'Event scope.';
COMMENT ON COLUMN "audit_log"."organization_id" IS 'Workspace scope.';
COMMENT ON COLUMN "audit_log"."actor_user_id" IS 'NULL when service actor used.';
COMMENT ON COLUMN "audit_log"."service_actor" IS 'Worker/simulator identity when user absent.';
COMMENT ON COLUMN "audit_log"."action" IS 'Stable operation code.';
COMMENT ON COLUMN "audit_log"."entity_type" IS 'Whitelisted affected entity kind.';
COMMENT ON COLUMN "audit_log"."entity_id" IS 'Historical target ID; deliberately not a generic FK.';
COMMENT ON COLUMN "audit_log"."description" IS 'Short safe description.';
COMMENT ON COLUMN "audit_log"."safe_change" IS 'Limited before/after fields, no secrets or full messages.';
COMMENT ON COLUMN "audit_log"."correlation_id" IS 'Operation trace.';
COMMENT ON COLUMN "audit_log"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "event_report" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "event_id" uuid NOT NULL,
  "reporter_user_id" uuid NOT NULL,
  "category" text NOT NULL,
  "description" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "resolved_by_user_id" uuid,
  "resolution" text,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_report_pk" PRIMARY KEY (id),
  CONSTRAINT "event_report_ck1" CHECK (status IN ('open','reviewing','resolved')),
  CONSTRAINT "event_report_ck2" CHECK (status <> 'resolved' OR (resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL AND resolution IS NOT NULL))
);
COMMENT ON TABLE "event_report" IS 'Signed-in report about accessible event.';
COMMENT ON COLUMN "event_report"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "event_report"."event_id" IS 'Reported event.';
COMMENT ON COLUMN "event_report"."reporter_user_id" IS 'Reporter.';
COMMENT ON COLUMN "event_report"."category" IS 'Reason code.';
COMMENT ON COLUMN "event_report"."description" IS 'Reporter explanation.';
COMMENT ON COLUMN "event_report"."status" IS 'open, reviewing or resolved.';
COMMENT ON COLUMN "event_report"."resolved_by_user_id" IS 'Platform reviewer.';
COMMENT ON COLUMN "event_report"."resolution" IS 'Resolution explanation.';
COMMENT ON COLUMN "event_report"."resolved_at" IS 'Completion time.';
COMMENT ON COLUMN "event_report"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "moderation_action" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" uuid NOT NULL,
  "target_user_id" uuid,
  "target_event_id" uuid,
  "target_activation_id" uuid,
  "action" text NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_action_pk" PRIMARY KEY (id),
  CONSTRAINT "moderation_action_ck1" CHECK (num_nonnulls(target_user_id,target_event_id,target_activation_id) = 1),
  CONSTRAINT "moderation_action_ck2" CHECK (action IN ('suspend','reinstate')),
  CONSTRAINT "moderation_action_ck3" CHECK (length(btrim(reason)) > 0)
);
COMMENT ON TABLE "moderation_action" IS 'Append-only moderation evidence; exactly one real target.';
COMMENT ON COLUMN "moderation_action"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "moderation_action"."actor_user_id" IS 'Platform admin.';
COMMENT ON COLUMN "moderation_action"."target_user_id" IS 'Account target.';
COMMENT ON COLUMN "moderation_action"."target_event_id" IS 'Event target.';
COMMENT ON COLUMN "moderation_action"."target_activation_id" IS 'Paid-sales target.';
COMMENT ON COLUMN "moderation_action"."action" IS 'suspend or reinstate.';
COMMENT ON COLUMN "moderation_action"."reason" IS 'Required reason.';
COMMENT ON COLUMN "moderation_action"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "platform_setting_version" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "setting_key" text NOT NULL,
  "version" integer NOT NULL,
  "value" jsonb NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_setting_version_pk" PRIMARY KEY (id),
  CONSTRAINT "platform_setting_version_uq1" UNIQUE ("setting_key", "version"),
  CONSTRAINT "platform_setting_version_ck1" CHECK (version > 0)
);
COMMENT ON TABLE "platform_setting_version" IS 'Append-only versioned settings; current version selected by effective time/version.';
COMMENT ON COLUMN "platform_setting_version"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "platform_setting_version"."setting_key" IS 'Whitelisted supported setting.';
COMMENT ON COLUMN "platform_setting_version"."version" IS 'Increasing per key.';
COMMENT ON COLUMN "platform_setting_version"."value" IS 'Typed by setting registry in application.';
COMMENT ON COLUMN "platform_setting_version"."effective_at" IS 'When setting applies to new operations.';
COMMENT ON COLUMN "platform_setting_version"."actor_user_id" IS 'Platform admin.';
COMMENT ON COLUMN "platform_setting_version"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "ga4_connection" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "property_id" text NOT NULL,
  "secret_reference" text NOT NULL,
  "is_enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ga4_connection_pk" PRIMARY KEY (id),
  CONSTRAINT "ga4_connection_uq1" UNIQUE ("organization_id")
);
COMMENT ON TABLE "ga4_connection" IS 'Optional organization-scoped analytics property configuration.';
COMMENT ON COLUMN "ga4_connection"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "ga4_connection"."organization_id" IS 'Owner.';
COMMENT ON COLUMN "ga4_connection"."property_id" IS 'GA4 property identifier.';
COMMENT ON COLUMN "ga4_connection"."secret_reference" IS 'Reference in secret manager; not credential material.';
COMMENT ON COLUMN "ga4_connection"."is_enabled" IS 'External dependency switch.';
COMMENT ON COLUMN "ga4_connection"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "analytics_export" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "connection_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "order_id" uuid,
  "refund_id" uuid,
  "measurement_kind" text NOT NULL,
  "analytics_event_id" uuid NOT NULL,
  "safe_payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_export_pk" PRIMARY KEY (id),
  CONSTRAINT "analytics_export_uq1" UNIQUE ("analytics_event_id"),
  CONSTRAINT "analytics_export_uq2" UNIQUE ("connection_id", "order_id", "measurement_kind"),
  CONSTRAINT "analytics_export_uq3" UNIQUE ("connection_id", "refund_id", "measurement_kind"),
  CONSTRAINT "analytics_export_ck1" CHECK (status IN ('pending','sent','skipped','failed')),
  CONSTRAINT "analytics_export_ck2" CHECK (jsonb_typeof(safe_payload) = 'object')
);
COMMENT ON TABLE "analytics_export" IS 'Deduplicated allowlisted optional traffic/commerce measurement.';
COMMENT ON COLUMN "analytics_export"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "analytics_export"."connection_id" IS 'Analytics destination.';
COMMENT ON COLUMN "analytics_export"."event_id" IS 'Authorized event.';
COMMENT ON COLUMN "analytics_export"."order_id" IS 'Optional canonical order.';
COMMENT ON COLUMN "analytics_export"."refund_id" IS 'Optional refund.';
COMMENT ON COLUMN "analytics_export"."measurement_kind" IS 'purchase, refund or other allowlisted server event.';
COMMENT ON COLUMN "analytics_export"."analytics_event_id" IS 'Separate nonsecret analytics dedupe ID.';
COMMENT ON COLUMN "analytics_export"."safe_payload" IS 'No names, email, ticket identifiers, QR/session tokens.';
COMMENT ON COLUMN "analytics_export"."status" IS 'pending, sent, skipped or failed.';
COMMENT ON COLUMN "analytics_export"."sent_at" IS 'Provider dispatch outcome.';
COMMENT ON COLUMN "analytics_export"."created_at" IS 'Server creation timestamp.';

CREATE TABLE "ga4_cache" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "connection_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "query_hash" text NOT NULL,
  "range_start" date NOT NULL,
  "range_end" date NOT NULL,
  "metrics" jsonb NOT NULL,
  "fetched_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ga4_cache_pk" PRIMARY KEY (id),
  CONSTRAINT "ga4_cache_uq1" UNIQUE ("connection_id", "event_id", "query_hash"),
  CONSTRAINT "ga4_cache_ck1" CHECK (range_end > range_start),
  CONSTRAINT "ga4_cache_ck2" CHECK (expires_at > fetched_at),
  CONSTRAINT "ga4_cache_ck3" CHECK (jsonb_typeof(metrics) = 'object')
);
COMMENT ON TABLE "ga4_cache" IS 'Disposable event-scoped traffic aggregates; never financial truth.';
COMMENT ON COLUMN "ga4_cache"."id" IS 'Primary key; immutable.';
COMMENT ON COLUMN "ga4_cache"."connection_id" IS 'Analytics source.';
COMMENT ON COLUMN "ga4_cache"."event_id" IS 'Event filter scope.';
COMMENT ON COLUMN "ga4_cache"."query_hash" IS 'Hash of canonical date range/dimensions/filters.';
COMMENT ON COLUMN "ga4_cache"."range_start" IS 'Inclusive period.';
COMMENT ON COLUMN "ga4_cache"."range_end" IS 'Exclusive period.';
COMMENT ON COLUMN "ga4_cache"."metrics" IS 'Versioned aggregate values, not raw visitor records.';
COMMENT ON COLUMN "ga4_cache"."fetched_at" IS 'Freshness.';
COMMENT ON COLUMN "ga4_cache"."expires_at" IS 'Cache deadline.';
COMMENT ON COLUMN "ga4_cache"."created_at" IS 'Server creation timestamp.';

-- Add FKs after all tables exist (intent/activation/order/attempt references are cyclic).
ALTER TABLE "auth_session" ADD CONSTRAINT "fk_auth_session_001" FOREIGN KEY ("user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "organization_member" ADD CONSTRAINT "fk_organization_member_002" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_staff" ADD CONSTRAINT "fk_event_staff_003" FOREIGN KEY ("event_id", "organization_id") REFERENCES "event" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_staff" ADD CONSTRAINT "fk_event_staff_004" FOREIGN KEY ("member_id", "organization_id") REFERENCES "organization_member" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "member_permission" ADD CONSTRAINT "fk_member_permission_005" FOREIGN KEY ("member_id") REFERENCES "organization_member" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_permission" ADD CONSTRAINT "fk_staff_permission_006" FOREIGN KEY ("event_staff_id") REFERENCES "event_staff" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event" ADD CONSTRAINT "fk_event_007" FOREIGN KEY ("venue_layout_id", "venue_id") REFERENCES "venue_layout" ("id", "venue_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event" ADD CONSTRAINT "fk_event_008" FOREIGN KEY ("category_id") REFERENCES "category" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event" ADD CONSTRAINT "fk_event_009" FOREIGN KEY ("venue_id") REFERENCES "venue" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_layout" ADD CONSTRAINT "fk_venue_layout_010" FOREIGN KEY ("venue_id") REFERENCES "venue" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_section" ADD CONSTRAINT "fk_venue_section_011" FOREIGN KEY ("layout_id") REFERENCES "venue_layout" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_row" ADD CONSTRAINT "fk_venue_row_012" FOREIGN KEY ("section_id", "layout_id") REFERENCES "venue_section" ("id", "layout_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "venue_seat" ADD CONSTRAINT "fk_venue_seat_013" FOREIGN KEY ("row_id", "layout_id") REFERENCES "venue_row" ("id", "layout_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_seat" ADD CONSTRAINT "fk_event_seat_014" FOREIGN KEY ("event_id", "layout_id") REFERENCES "event" ("id", "venue_layout_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_seat" ADD CONSTRAINT "fk_event_seat_015" FOREIGN KEY ("venue_seat_id", "layout_id") REFERENCES "venue_seat" ("id", "layout_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_seat" ADD CONSTRAINT "fk_event_seat_016" FOREIGN KEY ("ticket_type_id", "event_id") REFERENCES "ticket_type" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "inventory_allocation" ADD CONSTRAINT "fk_inventory_allocation_017" FOREIGN KEY ("hold_id", "event_id") REFERENCES "checkout_hold" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "inventory_allocation" ADD CONSTRAINT "fk_inventory_allocation_018" FOREIGN KEY ("ticket_type_id", "event_id") REFERENCES "ticket_type" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "inventory_allocation" ADD CONSTRAINT "fk_inventory_allocation_019" FOREIGN KEY ("event_seat_id", "event_id", "ticket_type_id") REFERENCES "event_seat" ("id", "event_id", "ticket_type_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ticket_order" ADD CONSTRAINT "fk_ticket_order_020" FOREIGN KEY ("hold_id", "event_id", "buyer_user_id") REFERENCES "checkout_hold" ("id", "event_id", "buyer_user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ticket_order" ADD CONSTRAINT "fk_ticket_order_021" FOREIGN KEY ("fulfillment_payment_attempt_id", "event_id") REFERENCES "payment_attempt" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "order_item" ADD CONSTRAINT "fk_order_item_022" FOREIGN KEY ("order_id", "event_id", "hold_id") REFERENCES "ticket_order" ("id", "event_id", "hold_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "order_item" ADD CONSTRAINT "fk_order_item_023" FOREIGN KEY ("allocation_id", "event_id", "hold_id", "ticket_type_id") REFERENCES "inventory_allocation" ("id", "event_id", "hold_id", "ticket_type_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_intent" ADD CONSTRAINT "fk_payment_intent_024" FOREIGN KEY ("order_id", "event_id") REFERENCES "ticket_order" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_intent" ADD CONSTRAINT "fk_payment_intent_025" FOREIGN KEY ("activation_id", "event_id") REFERENCES "sales_activation" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_attempt" ADD CONSTRAINT "fk_payment_attempt_026" FOREIGN KEY ("intent_id", "event_id", "environment") REFERENCES "payment_intent" ("id", "event_id", "environment") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "provider_event" ADD CONSTRAINT "fk_provider_event_027" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempt" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "provider_event" ADD CONSTRAINT "fk_provider_event_028" FOREIGN KEY ("refund_attempt_id") REFERENCES "refund_attempt" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "sales_activation" ADD CONSTRAINT "fk_sales_activation_029" FOREIGN KEY ("event_id", "organization_id") REFERENCES "event" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "sales_activation" ADD CONSTRAINT "fk_sales_activation_030" FOREIGN KEY ("payout_profile_id", "organization_id") REFERENCES "payout_profile" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "sales_activation" ADD CONSTRAINT "fk_sales_activation_031" FOREIGN KEY ("verification_record_id", "organization_id") REFERENCES "verification_record" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "sales_activation" ADD CONSTRAINT "fk_sales_activation_032" FOREIGN KEY ("terms_acceptance_id", "event_id") REFERENCES "terms_acceptance" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "sales_activation" ADD CONSTRAINT "fk_sales_activation_033" FOREIGN KEY ("paid_attempt_id", "event_id") REFERENCES "payment_attempt" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "campaign_ticket_type" ADD CONSTRAINT "fk_campaign_ticket_type_034" FOREIGN KEY ("campaign_id", "event_id") REFERENCES "campaign" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "campaign_ticket_type" ADD CONSTRAINT "fk_campaign_ticket_type_035" FOREIGN KEY ("ticket_type_id", "event_id") REFERENCES "ticket_type" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "promo_code" ADD CONSTRAINT "fk_promo_code_036" FOREIGN KEY ("campaign_id", "event_id") REFERENCES "campaign" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "promo_reservation" ADD CONSTRAINT "fk_promo_reservation_037" FOREIGN KEY ("promo_code_id", "event_id", "campaign_id") REFERENCES "promo_code" ("id", "event_id", "campaign_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "promo_reservation" ADD CONSTRAINT "fk_promo_reservation_038" FOREIGN KEY ("hold_id", "event_id") REFERENCES "checkout_hold" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "promo_redemption" ADD CONSTRAINT "fk_promo_redemption_039" FOREIGN KEY ("reservation_id", "event_id", "campaign_id") REFERENCES "promo_reservation" ("id", "event_id", "campaign_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "promo_redemption" ADD CONSTRAINT "fk_promo_redemption_040" FOREIGN KEY ("order_id", "event_id") REFERENCES "ticket_order" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ticket" ADD CONSTRAINT "fk_ticket_041" FOREIGN KEY ("order_item_id", "event_id") REFERENCES "order_item" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ticket_claim" ADD CONSTRAINT "fk_ticket_claim_042" FOREIGN KEY ("ticket_id") REFERENCES "ticket" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "entry_confirmation" ADD CONSTRAINT "fk_entry_confirmation_043" FOREIGN KEY ("ticket_id", "event_id", "attendee_user_id") REFERENCES "ticket" ("id", "event_id", "recipient_user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "entry_confirmation" ADD CONSTRAINT "fk_entry_confirmation_044" FOREIGN KEY ("session_id", "attendee_user_id") REFERENCES "auth_session" ("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "check_in" ADD CONSTRAINT "fk_check_in_045" FOREIGN KEY ("entry_confirmation_id", "ticket_id", "event_id") REFERENCES "entry_confirmation" ("id", "ticket_id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "check_in" ADD CONSTRAINT "fk_check_in_046" FOREIGN KEY ("scanner_session_id", "scanner_user_id") REFERENCES "auth_session" ("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "check_in" ADD CONSTRAINT "fk_check_in_047" FOREIGN KEY ("device_id", "scanner_user_id") REFERENCES "scanner_device" ("id", "owner_user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "check_in_reversal" ADD CONSTRAINT "fk_check_in_reversal_048" FOREIGN KEY ("check_in_id") REFERENCES "check_in" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "refund" ADD CONSTRAINT "fk_refund_049" FOREIGN KEY ("payment_attempt_id", "event_id") REFERENCES "payment_attempt" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "refund_attempt" ADD CONSTRAINT "fk_refund_attempt_050" FOREIGN KEY ("refund_id") REFERENCES "refund" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "demo_payout" ADD CONSTRAINT "fk_demo_payout_051" FOREIGN KEY ("event_id", "organization_id") REFERENCES "event" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "demo_payout" ADD CONSTRAINT "fk_demo_payout_052" FOREIGN KEY ("payout_profile_id", "organization_id") REFERENCES "payout_profile" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "finance_entry" ADD CONSTRAINT "fk_finance_entry_053" FOREIGN KEY ("payment_attempt_id", "event_id") REFERENCES "payment_attempt" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "finance_entry" ADD CONSTRAINT "fk_finance_entry_054" FOREIGN KEY ("refund_id", "event_id") REFERENCES "refund" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "finance_entry" ADD CONSTRAINT "fk_finance_entry_055" FOREIGN KEY ("demo_payout_id", "event_id") REFERENCES "demo_payout" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "offline_package" ADD CONSTRAINT "fk_offline_package_056" FOREIGN KEY ("session_id", "scanner_user_id") REFERENCES "auth_session" ("id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "offline_package" ADD CONSTRAINT "fk_offline_package_057" FOREIGN KEY ("device_id", "scanner_user_id") REFERENCES "scanner_device" ("id", "owner_user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "offline_operation" ADD CONSTRAINT "fk_offline_operation_058" FOREIGN KEY ("package_id", "event_id", "device_id") REFERENCES "offline_package" ("id", "event_id", "device_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "offline_operation" ADD CONSTRAINT "fk_offline_operation_059" FOREIGN KEY ("resolved_ticket_id", "event_id") REFERENCES "ticket" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "offline_operation" ADD CONSTRAINT "fk_offline_operation_060" FOREIGN KEY ("accepted_check_in_id") REFERENCES "check_in" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "sync_conflict" ADD CONSTRAINT "fk_sync_conflict_061" FOREIGN KEY ("offline_operation_id") REFERENCES "offline_operation" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "sync_conflict" ADD CONSTRAINT "fk_sync_conflict_062" FOREIGN KEY ("existing_check_in_id") REFERENCES "check_in" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_case" ADD CONSTRAINT "fk_support_case_063" FOREIGN KEY ("event_id", "organization_id") REFERENCES "event" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_case" ADD CONSTRAINT "fk_support_case_064" FOREIGN KEY ("order_id", "event_id") REFERENCES "ticket_order" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_case" ADD CONSTRAINT "fk_support_case_065" FOREIGN KEY ("ticket_id", "event_id") REFERENCES "ticket" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_message" ADD CONSTRAINT "fk_support_message_066" FOREIGN KEY ("case_id") REFERENCES "support_case" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_attachment" ADD CONSTRAINT "fk_support_attachment_067" FOREIGN KEY ("message_id", "case_id") REFERENCES "support_message" ("id", "case_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "case_change" ADD CONSTRAINT "fk_case_change_068" FOREIGN KEY ("case_id") REFERENCES "support_case" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "notification_delivery" ADD CONSTRAINT "fk_notification_delivery_069" FOREIGN KEY ("notification_id") REFERENCES "notification" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "audit_log" ADD CONSTRAINT "fk_audit_log_070" FOREIGN KEY ("event_id", "organization_id") REFERENCES "event" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "moderation_action" ADD CONSTRAINT "fk_moderation_action_071" FOREIGN KEY ("target_event_id") REFERENCES "event" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "moderation_action" ADD CONSTRAINT "fk_moderation_action_072" FOREIGN KEY ("target_activation_id") REFERENCES "sales_activation" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "analytics_export" ADD CONSTRAINT "fk_analytics_export_073" FOREIGN KEY ("connection_id") REFERENCES "ga4_connection" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "analytics_export" ADD CONSTRAINT "fk_analytics_export_074" FOREIGN KEY ("order_id", "event_id") REFERENCES "ticket_order" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "analytics_export" ADD CONSTRAINT "fk_analytics_export_075" FOREIGN KEY ("refund_id", "event_id") REFERENCES "refund" ("id", "event_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ga4_cache" ADD CONSTRAINT "fk_ga4_cache_076" FOREIGN KEY ("connection_id") REFERENCES "ga4_connection" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "account_token" ADD CONSTRAINT "fk_account_token_077" FOREIGN KEY ("user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "platform_admin" ADD CONSTRAINT "fk_platform_admin_078" FOREIGN KEY ("user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "platform_admin" ADD CONSTRAINT "fk_platform_admin_079" FOREIGN KEY ("granted_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "organization" ADD CONSTRAINT "fk_organization_080" FOREIGN KEY ("owner_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "organization_member" ADD CONSTRAINT "fk_organization_member_081" FOREIGN KEY ("user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_invitation" ADD CONSTRAINT "fk_staff_invitation_082" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_invitation" ADD CONSTRAINT "fk_staff_invitation_083" FOREIGN KEY ("invited_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "staff_invitation" ADD CONSTRAINT "fk_staff_invitation_084" FOREIGN KEY ("accepted_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event" ADD CONSTRAINT "fk_event_085" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_access_grant" ADD CONSTRAINT "fk_event_access_grant_086" FOREIGN KEY ("event_id") REFERENCES "event" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_access_grant" ADD CONSTRAINT "fk_event_access_grant_087" FOREIGN KEY ("user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_access_grant" ADD CONSTRAINT "fk_event_access_grant_088" FOREIGN KEY ("granted_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_media" ADD CONSTRAINT "fk_event_media_089" FOREIGN KEY ("event_id") REFERENCES "event" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_media" ADD CONSTRAINT "fk_event_media_090" FOREIGN KEY ("file_id") REFERENCES "stored_file" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ticket_type" ADD CONSTRAINT "fk_ticket_type_091" FOREIGN KEY ("event_id") REFERENCES "event" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "checkout_hold" ADD CONSTRAINT "fk_checkout_hold_092" FOREIGN KEY ("event_id") REFERENCES "event" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "checkout_hold" ADD CONSTRAINT "fk_checkout_hold_093" FOREIGN KEY ("buyer_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payout_profile" ADD CONSTRAINT "fk_payout_profile_094" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "verification_record" ADD CONSTRAINT "fk_verification_record_095" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "verification_record" ADD CONSTRAINT "fk_verification_record_096" FOREIGN KEY ("submitted_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "verification_record" ADD CONSTRAINT "fk_verification_record_097" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "terms_acceptance" ADD CONSTRAINT "fk_terms_acceptance_098" FOREIGN KEY ("event_id") REFERENCES "event" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "terms_acceptance" ADD CONSTRAINT "fk_terms_acceptance_099" FOREIGN KEY ("accepted_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "campaign" ADD CONSTRAINT "fk_campaign_100" FOREIGN KEY ("event_id") REFERENCES "event" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ticket" ADD CONSTRAINT "fk_ticket_101" FOREIGN KEY ("recipient_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ticket" ADD CONSTRAINT "fk_ticket_102" FOREIGN KEY ("pdf_file_id") REFERENCES "stored_file" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ticket_claim" ADD CONSTRAINT "fk_ticket_claim_103" FOREIGN KEY ("consumed_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "scanner_device" ADD CONSTRAINT "fk_scanner_device_104" FOREIGN KEY ("owner_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "check_in_reversal" ADD CONSTRAINT "fk_check_in_reversal_105" FOREIGN KEY ("actor_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "refund" ADD CONSTRAINT "fk_refund_106" FOREIGN KEY ("requested_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "refund" ADD CONSTRAINT "fk_refund_107" FOREIGN KEY ("approved_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "offline_package" ADD CONSTRAINT "fk_offline_package_108" FOREIGN KEY ("event_id") REFERENCES "event" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "offline_package" ADD CONSTRAINT "fk_offline_package_109" FOREIGN KEY ("file_id") REFERENCES "stored_file" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "sync_conflict" ADD CONSTRAINT "fk_sync_conflict_110" FOREIGN KEY ("resolved_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "stored_file" ADD CONSTRAINT "fk_stored_file_111" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_case" ADD CONSTRAINT "fk_support_case_112" FOREIGN KEY ("requester_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_case" ADD CONSTRAINT "fk_support_case_113" FOREIGN KEY ("assigned_to_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_message" ADD CONSTRAINT "fk_support_message_114" FOREIGN KEY ("author_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "support_attachment" ADD CONSTRAINT "fk_support_attachment_115" FOREIGN KEY ("file_id") REFERENCES "stored_file" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "case_change" ADD CONSTRAINT "fk_case_change_116" FOREIGN KEY ("actor_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "notification" ADD CONSTRAINT "fk_notification_117" FOREIGN KEY ("recipient_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "notification" ADD CONSTRAINT "fk_notification_118" FOREIGN KEY ("event_id") REFERENCES "event" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "outbox_job" ADD CONSTRAINT "fk_outbox_job_119" FOREIGN KEY ("event_id") REFERENCES "event" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "idempotency_record" ADD CONSTRAINT "fk_idempotency_record_120" FOREIGN KEY ("actor_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "audit_log" ADD CONSTRAINT "fk_audit_log_121" FOREIGN KEY ("actor_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_report" ADD CONSTRAINT "fk_event_report_122" FOREIGN KEY ("event_id") REFERENCES "event" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_report" ADD CONSTRAINT "fk_event_report_123" FOREIGN KEY ("reporter_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "event_report" ADD CONSTRAINT "fk_event_report_124" FOREIGN KEY ("resolved_by_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "moderation_action" ADD CONSTRAINT "fk_moderation_action_125" FOREIGN KEY ("actor_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "moderation_action" ADD CONSTRAINT "fk_moderation_action_126" FOREIGN KEY ("target_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "platform_setting_version" ADD CONSTRAINT "fk_platform_setting_version_127" FOREIGN KEY ("actor_user_id") REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ga4_connection" ADD CONSTRAINT "fk_ga4_connection_128" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ga4_cache" ADD CONSTRAINT "fk_ga4_cache_129" FOREIGN KEY ("event_id") REFERENCES "event" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Conditional uniqueness and workload indexes. Never use now() in a partial predicate.
CREATE UNIQUE INDEX "uq_live_seat" ON "inventory_allocation" (event_seat_id) WHERE event_seat_id IS NOT NULL AND state IN ('held','sold','refund_quarantine');
CREATE UNIQUE INDEX "uq_active_promo_hold" ON "promo_reservation" (hold_id) WHERE status = 'active';
CREATE UNIQUE INDEX "uq_current_admission" ON "check_in" (ticket_id) WHERE reversed_at IS NULL;
CREATE UNIQUE INDEX "uq_open_report" ON "event_report" (event_id, reporter_user_id, category) WHERE status IN ('open','reviewing');
CREATE UNIQUE INDEX "uq_open_ticket_claim" ON "ticket_claim" (ticket_id) WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX "ix_hold_expiry" ON "checkout_hold" (expires_at) WHERE status = 'active';
CREATE INDEX "ix_inventory_capacity" ON "inventory_allocation" (event_id, ticket_type_id, state);
CREATE INDEX "ix_campaign_pending" ON "promo_reservation" (campaign_id, status, expires_at);
CREATE INDEX "ix_campaign_redemptions" ON "promo_redemption" (campaign_id, created_at);
CREATE INDEX "ix_jobs_ready" ON "outbox_job" (available_at, created_at) WHERE status = 'pending';
CREATE INDEX "ix_jobs_lease" ON "outbox_job" (lease_until) WHERE status = 'leased';
CREATE INDEX "ix_payment_reconcile" ON "payment_attempt" (next_reconcile_at) WHERE status = 'pending';
CREATE INDEX "ix_buyer_orders" ON "ticket_order" (buyer_user_id, created_at);
CREATE INDEX "ix_event_sales" ON "ticket_order" (event_id, confirmed_at) WHERE confirmed_at IS NOT NULL;
CREATE INDEX "ix_public_catalogue" ON "event" (starts_at, category_id) WHERE publication_state = 'published' AND moderation_state = 'normal' AND visibility = 'public';
CREATE INDEX "ix_case_cursor" ON "support_message" (case_id, created_at, id);
CREATE INDEX "ix_event_timeline" ON "audit_log" (event_id, created_at, id);
CREATE INDEX "ix_inbox" ON "notification" (recipient_user_id, created_at, id);
CREATE INDEX "ix_event_finance" ON "finance_entry" (event_id, environment, effective_at);
CREATE INDEX "ix_effective_settings" ON "platform_setting_version" (setting_key, effective_at, version);
CREATE INDEX "ix_auth_session_001" ON "auth_session" ("user_id");
CREATE INDEX "ix_event_staff_003" ON "event_staff" ("event_id", "organization_id");
CREATE INDEX "ix_event_staff_004" ON "event_staff" ("member_id", "organization_id");
CREATE INDEX "ix_event_007" ON "event" ("venue_layout_id", "venue_id");
CREATE INDEX "ix_event_008" ON "event" ("category_id");
CREATE INDEX "ix_event_009" ON "event" ("venue_id");
CREATE INDEX "ix_venue_row_012" ON "venue_row" ("section_id", "layout_id");
CREATE INDEX "ix_venue_seat_013" ON "venue_seat" ("row_id", "layout_id");
CREATE INDEX "ix_event_seat_014" ON "event_seat" ("event_id", "layout_id");
CREATE INDEX "ix_event_seat_015" ON "event_seat" ("venue_seat_id", "layout_id");
CREATE INDEX "ix_event_seat_016" ON "event_seat" ("ticket_type_id", "event_id");
CREATE INDEX "ix_inventory_allocation_017" ON "inventory_allocation" ("hold_id", "event_id");
CREATE INDEX "ix_inventory_allocation_018" ON "inventory_allocation" ("ticket_type_id", "event_id");
CREATE INDEX "ix_inventory_allocation_019" ON "inventory_allocation" ("event_seat_id", "event_id", "ticket_type_id");
CREATE INDEX "ix_ticket_order_020" ON "ticket_order" ("hold_id", "event_id", "buyer_user_id");
CREATE INDEX "ix_ticket_order_021" ON "ticket_order" ("fulfillment_payment_attempt_id", "event_id");
CREATE INDEX "ix_order_item_022" ON "order_item" ("order_id", "event_id", "hold_id");
CREATE INDEX "ix_order_item_023" ON "order_item" ("allocation_id", "event_id", "hold_id", "ticket_type_id");
CREATE INDEX "ix_payment_intent_024" ON "payment_intent" ("order_id", "event_id");
CREATE INDEX "ix_payment_intent_025" ON "payment_intent" ("activation_id", "event_id");
CREATE INDEX "ix_payment_attempt_026" ON "payment_attempt" ("intent_id", "event_id", "environment");
CREATE INDEX "ix_provider_event_027" ON "provider_event" ("payment_attempt_id");
CREATE INDEX "ix_provider_event_028" ON "provider_event" ("refund_attempt_id");
CREATE INDEX "ix_sales_activation_029" ON "sales_activation" ("event_id", "organization_id");
CREATE INDEX "ix_sales_activation_030" ON "sales_activation" ("payout_profile_id", "organization_id");
CREATE INDEX "ix_sales_activation_031" ON "sales_activation" ("verification_record_id", "organization_id");
CREATE INDEX "ix_sales_activation_032" ON "sales_activation" ("terms_acceptance_id", "event_id");
CREATE INDEX "ix_sales_activation_033" ON "sales_activation" ("paid_attempt_id", "event_id");
CREATE INDEX "ix_campaign_ticket_type_034" ON "campaign_ticket_type" ("campaign_id", "event_id");
CREATE INDEX "ix_campaign_ticket_type_035" ON "campaign_ticket_type" ("ticket_type_id", "event_id");
CREATE INDEX "ix_promo_code_036" ON "promo_code" ("campaign_id", "event_id");
CREATE INDEX "ix_promo_reservation_037" ON "promo_reservation" ("promo_code_id", "event_id", "campaign_id");
CREATE INDEX "ix_promo_reservation_038" ON "promo_reservation" ("hold_id", "event_id");
CREATE INDEX "ix_promo_redemption_039" ON "promo_redemption" ("reservation_id", "event_id", "campaign_id");
CREATE INDEX "ix_promo_redemption_040" ON "promo_redemption" ("order_id", "event_id");
CREATE INDEX "ix_ticket_041" ON "ticket" ("order_item_id", "event_id");
CREATE INDEX "ix_ticket_claim_042" ON "ticket_claim" ("ticket_id");
CREATE INDEX "ix_entry_confirmation_043" ON "entry_confirmation" ("ticket_id", "event_id", "attendee_user_id");
CREATE INDEX "ix_entry_confirmation_044" ON "entry_confirmation" ("session_id", "attendee_user_id");
CREATE INDEX "ix_check_in_045" ON "check_in" ("entry_confirmation_id", "ticket_id", "event_id");
CREATE INDEX "ix_check_in_046" ON "check_in" ("scanner_session_id", "scanner_user_id");
CREATE INDEX "ix_check_in_047" ON "check_in" ("device_id", "scanner_user_id");
CREATE INDEX "ix_refund_049" ON "refund" ("payment_attempt_id", "event_id");
CREATE INDEX "ix_demo_payout_051" ON "demo_payout" ("event_id", "organization_id");
CREATE INDEX "ix_demo_payout_052" ON "demo_payout" ("payout_profile_id", "organization_id");
CREATE INDEX "ix_finance_entry_053" ON "finance_entry" ("payment_attempt_id", "event_id");
CREATE INDEX "ix_finance_entry_054" ON "finance_entry" ("refund_id", "event_id");
CREATE INDEX "ix_finance_entry_055" ON "finance_entry" ("demo_payout_id", "event_id");
CREATE INDEX "ix_offline_package_056" ON "offline_package" ("session_id", "scanner_user_id");
CREATE INDEX "ix_offline_package_057" ON "offline_package" ("device_id", "scanner_user_id");
CREATE INDEX "ix_offline_operation_058" ON "offline_operation" ("package_id", "event_id", "device_id");
CREATE INDEX "ix_offline_operation_059" ON "offline_operation" ("resolved_ticket_id", "event_id");
CREATE INDEX "ix_offline_operation_060" ON "offline_operation" ("accepted_check_in_id");
CREATE INDEX "ix_sync_conflict_062" ON "sync_conflict" ("existing_check_in_id");
CREATE INDEX "ix_support_case_063" ON "support_case" ("event_id", "organization_id");
CREATE INDEX "ix_support_case_064" ON "support_case" ("order_id", "event_id");
CREATE INDEX "ix_support_case_065" ON "support_case" ("ticket_id", "event_id");
CREATE INDEX "ix_support_attachment_067" ON "support_attachment" ("message_id", "case_id");
CREATE INDEX "ix_case_change_068" ON "case_change" ("case_id");
CREATE INDEX "ix_audit_log_070" ON "audit_log" ("event_id", "organization_id");
CREATE INDEX "ix_moderation_action_071" ON "moderation_action" ("target_event_id");
CREATE INDEX "ix_moderation_action_072" ON "moderation_action" ("target_activation_id");
CREATE INDEX "ix_analytics_export_074" ON "analytics_export" ("order_id", "event_id");
CREATE INDEX "ix_analytics_export_075" ON "analytics_export" ("refund_id", "event_id");
CREATE INDEX "ix_account_token_077" ON "account_token" ("user_id");
CREATE INDEX "ix_platform_admin_079" ON "platform_admin" ("granted_by_user_id");
CREATE INDEX "ix_organization_080" ON "organization" ("owner_user_id");
CREATE INDEX "ix_organization_member_081" ON "organization_member" ("user_id");
CREATE INDEX "ix_staff_invitation_082" ON "staff_invitation" ("organization_id");
CREATE INDEX "ix_staff_invitation_083" ON "staff_invitation" ("invited_by_user_id");
CREATE INDEX "ix_staff_invitation_084" ON "staff_invitation" ("accepted_by_user_id");
CREATE INDEX "ix_event_085" ON "event" ("organization_id");
CREATE INDEX "ix_event_access_grant_087" ON "event_access_grant" ("user_id");
CREATE INDEX "ix_event_access_grant_088" ON "event_access_grant" ("granted_by_user_id");
CREATE INDEX "ix_event_media_090" ON "event_media" ("file_id");
CREATE INDEX "ix_ticket_type_091" ON "ticket_type" ("event_id");
CREATE INDEX "ix_checkout_hold_092" ON "checkout_hold" ("event_id");
CREATE INDEX "ix_checkout_hold_093" ON "checkout_hold" ("buyer_user_id");
CREATE INDEX "ix_payout_profile_094" ON "payout_profile" ("organization_id");
CREATE INDEX "ix_verification_record_095" ON "verification_record" ("organization_id");
CREATE INDEX "ix_verification_record_096" ON "verification_record" ("submitted_by_user_id");
CREATE INDEX "ix_verification_record_097" ON "verification_record" ("reviewed_by_user_id");
CREATE INDEX "ix_terms_acceptance_099" ON "terms_acceptance" ("accepted_by_user_id");
CREATE INDEX "ix_campaign_100" ON "campaign" ("event_id");
CREATE INDEX "ix_ticket_101" ON "ticket" ("recipient_user_id");
CREATE INDEX "ix_ticket_102" ON "ticket" ("pdf_file_id");
CREATE INDEX "ix_ticket_claim_103" ON "ticket_claim" ("consumed_by_user_id");
CREATE INDEX "ix_scanner_device_104" ON "scanner_device" ("owner_user_id");
CREATE INDEX "ix_check_in_reversal_105" ON "check_in_reversal" ("actor_user_id");
CREATE INDEX "ix_refund_106" ON "refund" ("requested_by_user_id");
CREATE INDEX "ix_refund_107" ON "refund" ("approved_by_user_id");
CREATE INDEX "ix_offline_package_108" ON "offline_package" ("event_id");
CREATE INDEX "ix_offline_package_109" ON "offline_package" ("file_id");
CREATE INDEX "ix_sync_conflict_110" ON "sync_conflict" ("resolved_by_user_id");
CREATE INDEX "ix_stored_file_111" ON "stored_file" ("uploaded_by_user_id");
CREATE INDEX "ix_support_case_112" ON "support_case" ("requester_user_id");
CREATE INDEX "ix_support_case_113" ON "support_case" ("assigned_to_user_id");
CREATE INDEX "ix_support_message_114" ON "support_message" ("author_user_id");
CREATE INDEX "ix_case_change_116" ON "case_change" ("actor_user_id");
CREATE INDEX "ix_notification_118" ON "notification" ("event_id");
CREATE INDEX "ix_outbox_job_119" ON "outbox_job" ("event_id");
CREATE INDEX "ix_audit_log_121" ON "audit_log" ("actor_user_id");
CREATE INDEX "ix_event_report_122" ON "event_report" ("event_id");
CREATE INDEX "ix_event_report_123" ON "event_report" ("reporter_user_id");
CREATE INDEX "ix_event_report_124" ON "event_report" ("resolved_by_user_id");
CREATE INDEX "ix_moderation_action_125" ON "moderation_action" ("actor_user_id");
CREATE INDEX "ix_moderation_action_126" ON "moderation_action" ("target_user_id");
CREATE INDEX "ix_platform_setting_version_127" ON "platform_setting_version" ("actor_user_id");
CREATE INDEX "ix_ga4_cache_129" ON "ga4_cache" ("event_id");

-- Protect append-only evidence even from accidental ordinary UPDATE/DELETE statements.
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only history: % cannot be %', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000'; END;
$$;
CREATE TRIGGER "audit_log_immutable" BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER "finance_entry_immutable" BEFORE UPDATE OR DELETE ON "finance_entry" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER "promo_redemption_immutable" BEFORE UPDATE OR DELETE ON "promo_redemption" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER "terms_acceptance_immutable" BEFORE UPDATE OR DELETE ON "terms_acceptance" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER "check_in_reversal_immutable" BEFORE UPDATE OR DELETE ON "check_in_reversal" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER "case_change_immutable" BEFORE UPDATE OR DELETE ON "case_change" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER "support_message_immutable" BEFORE UPDATE OR DELETE ON "support_message" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER "moderation_action_immutable" BEFORE UPDATE OR DELETE ON "moderation_action" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER "platform_setting_version_immutable" BEFORE UPDATE OR DELETE ON "platform_setting_version" FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

-- Application and worker roles must not own the schema or have DDL/TRUNCATE privileges.
-- Explicit grants and authenticated transaction services are deployment work; do not expose these tables directly to clients.
COMMIT;
