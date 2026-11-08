import { uploadFile, type UploadFile } from "./files";
import { request } from "./http";
import type {
  SupportCase,
  SupportCaseCreate,
  SupportCaseCreated,
  SupportCasePage,
  SupportCaseQuery,
  SupportChange,
  SupportDownloadLink,
  SupportMessage,
  SupportMessageCreate,
  SupportStatus,
  SupportUpdatePage,
  SupportUploadedFile,
} from "./types/support";

// Contract: backend/SUPPORT_API.md. Every endpoint needs a verified account.
const BASE = "/api/v1/support";

function casePath(caseId: string, suffix = ""): string {
  return `${BASE}/cases/${encodeURIComponent(caseId)}${suffix}`;
}

export function listCases(query: SupportCaseQuery = {}): Promise<SupportCasePage> {
  return request<SupportCasePage>(`${BASE}/cases`, {
    query: {
      view: query.view,
      status: query.status,
      category: query.category,
      event_id: query.event_id,
      limit: query.limit,
      offset: query.offset,
    },
  });
}

export function openCase(data: SupportCaseCreate): Promise<SupportCaseCreated> {
  return request<SupportCaseCreated>(`${BASE}/cases`, { method: "POST", body: data });
}

export function getCase(caseId: string): Promise<SupportCase> {
  return request<SupportCase>(casePath(caseId));
}

export function caseUpdates(caseId: string, after: number, limit = 100): Promise<SupportUpdatePage> {
  return request<SupportUpdatePage>(casePath(caseId, "/updates"), { query: { after, limit } });
}

export function sendMessage(caseId: string, data: SupportMessageCreate): Promise<SupportMessage> {
  return request<SupportMessage>(casePath(caseId, "/messages"), { method: "POST", body: data });
}

// Staff actions answer with the history item they recorded.
export function changeStatus(caseId: string, status: SupportStatus, reason?: string): Promise<SupportChange> {
  return request<SupportChange>(casePath(caseId, "/status"), { method: "POST", body: { status, reason: reason || undefined } });
}

export function assignCase(caseId: string, assigneeUserId: string | null, reason?: string): Promise<SupportChange> {
  return request<SupportChange>(casePath(caseId, "/assignment"), {
    method: "POST",
    body: { assignee_user_id: assigneeUserId, reason: reason || undefined },
  });
}

export function escalateCase(caseId: string, reason: string): Promise<SupportChange> {
  return request<SupportChange>(casePath(caseId, "/escalation"), { method: "POST", body: { reason } });
}

export function attachmentDownloadLink(caseId: string, attachmentId: string): Promise<SupportDownloadLink> {
  return request<SupportDownloadLink>(casePath(caseId, `/attachments/${encodeURIComponent(attachmentId)}/download-link`));
}

// Raw-body upload (no multipart): the request body is the file and
// Content-Type its declared type.
export function uploadAttachment(caseId: string, file: UploadFile): Promise<SupportUploadedFile> {
  return uploadFile<SupportUploadedFile>(casePath(caseId, "/attachments"), file, { filename: file.name });
}
