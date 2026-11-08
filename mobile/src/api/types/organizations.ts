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
  { id: "event_edit", label: "Edit event", hint: "Change details, tickets and publication" },
  { id: "attendees", label: "Attendees", hint: "See the attendee list" },
  { id: "staff", label: "Staff", hint: "Assign other staff to this event" },
  { id: "reports", label: "Reports", hint: "Read the activity history" },
  { id: "scan", label: "Scan tickets", hint: "Check attendees in with the mobile app" },
  { id: "reverse_checkin", label: "Undo check-ins", hint: "Reverse an accidental admission" },
  { id: "support", label: "Support", hint: "Reserved for the support module" },
  { id: "refund", label: "Refunds", hint: "Reserved for the refund module" },
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
