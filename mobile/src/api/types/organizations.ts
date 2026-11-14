import { t } from "@/i18n";

// Mirrors backend/app/catalog_schemas.py: organizations, members,
// invitations and per-event staff capabilities.

export interface Organization {
  id: string;
  created_at: string;
  owner_user_id: string;
  name: string;
  contact_email: string;
  contact_phone: string | null;
  status: string;
}

export interface OrganizationCreate {
  name: string;
  contact_email: string;
  contact_phone: string | null;
}

export type OrgCapability = "manage_profile" | "manage_staff" | "finance";
export type EventCapability =
  | "event_edit"
  | "attendees"
  | "support"
  | "reports"
  | "refund"
  | "scan"
  | "reverse_checkin"
  | "staff";

export const EVENT_CAPABILITIES: Array<{ id: EventCapability; label: string; hint: string }> = [
  { id: "event_edit", get label() { return t("capability.edit_event"); }, get hint() { return t("capability.edit_hint"); } },
  { id: "attendees", get label() { return t("organizer.attendees"); }, get hint() { return t("capability.attendees_hint"); } },
  { id: "staff", get label() { return t("organizer.staff"); }, get hint() { return t("capability.staff_hint"); } },
  { id: "reports", get label() { return t("common.reports"); }, get hint() { return t("capability.reports_hint"); } },
  { id: "scan", get label() { return t("capability.scan"); }, get hint() { return t("capability.scan_hint"); } },
  { id: "reverse_checkin", get label() { return t("capability.reverse"); }, get hint() { return t("capability.reverse_hint"); } },
  { id: "support", get label() { return t("nav.support"); }, get hint() { return t("mobile.capability.support_hint"); } },
  { id: "refund", get label() { return t("event.refunds"); }, get hint() { return t("mobile.capability.refund_hint"); } },
];

export interface MemberDetail {
  id: string;
  created_at: string;
  organization_id: string;
  user_id: string;
  status: string;
  revoked_at: string | null;
  display_name: string;
  email: string;
  capabilities: OrgCapability[];
}

export interface Invitation {
  id: string;
  created_at: string;
  organization_id: string;
  email: string;
  invited_by_user_id: string;
  expires_at: string;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
}

export interface StaffAssignment {
  id: string;
  created_at: string;
  event_id: string;
  organization_id: string;
  member_id: string;
  revoked_at: string | null;
  capabilities: EventCapability[];
}
