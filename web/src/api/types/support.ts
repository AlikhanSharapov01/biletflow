// Support case shapes mirrored from backend/app/support_schemas.py
// (contract: backend/SUPPORT_API.md). Dates are ISO-8601 strings.

export const SUPPORT_CATEGORIES = [
  "delivery",
  "payment",
  "refund",
  "seating",
  "event_info",
  "check_in",
  "account",
  "technical",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_STATUSES = ["open", "in_progress", "waiting_for_customer", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export type SupportCaseKind = "attendee" | "organizer_platform";
export type SupportViewerRole = "requester" | "support" | "platform";
export type SupportListView = "mine" | "queue";

export interface SupportPerson {
  id: string;
  display_name: string;
}

export interface SupportCase {
  id: string;
  kind: SupportCaseKind;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  requester: SupportPerson;
  organization_id: string | null;
  event_id: string | null;
  order_id: string | null;
  ticket_id: string | null;
  assigned_to: SupportPerson | null;
  escalated_at: string | null;
  resolved_at: string | null;
  last_seq: number;
  created_at: string;
  updated_at: string;
  viewer_roles: SupportViewerRole[];
}

export interface SupportCasePage {
  items: SupportCase[];
  total: number;
  limit: number;
  offset: number;
}

export interface SupportCaseQuery {
  view?: SupportListView;
  status?: SupportStatus | "";
  category?: SupportCategory | "";
  event_id?: string;
  limit?: number;
  offset?: number;
}

export interface SupportContext {
  event_id?: string;
  order_id?: string;
  ticket_id?: string;
  organization_id?: string;
}

export interface SupportCaseCreate extends SupportContext {
  kind: SupportCaseKind;
  category: SupportCategory;
  subject: string;
  body: string;
  client_message_id: string;
}

export interface SupportAttachment {
  id: string;
  file_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface SupportMessage {
  seq: number;
  type: "message";
  id: string;
  case_id: string;
  author: SupportPerson;
  author_role: "requester" | "support";
  client_message_id: string;
  body: string;
  created_at: string;
  replayed: boolean;
  attachments: SupportAttachment[];
}

export interface SupportChange {
  seq: number;
  type: "change";
  id: string;
  case_id: string;
  actor: SupportPerson;
  change_kind: "status" | "assignment" | "escalation" | string;
  before_value: string | null;
  after_value: string | null;
  reason: string | null;
  created_at: string;
}

export type SupportThreadItem = SupportMessage | SupportChange;

export interface SupportUpdatePage {
  items: SupportThreadItem[];
  next_after: number;
  has_more: boolean;
}

export interface SupportCaseCreated {
  case: SupportCase;
  message: SupportMessage;
}

export interface SupportMessageCreate {
  client_message_id: string;
  body: string;
  attachment_ids: string[];
}

export interface SupportUploadedFile {
  file_id: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  status: string;
  expires_at: string;
}

export interface SupportDownloadLink {
  url: string;
  expires_at: string;
}
