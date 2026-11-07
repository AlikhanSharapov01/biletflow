import { refreshAccessToken, request } from "./client";
import { ApiError, NETWORK_MESSAGE, SESSION_EXPIRED_MESSAGE, failureMessage } from "./errors";
import { session } from "./session";
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

function errorCode(body: unknown): string | undefined {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === "object" && typeof (detail as { code?: unknown }).code === "string") {
    return (detail as { code: string }).code;
  }
  return undefined;
}

async function sendRaw(url: string, file: File, token: string): Promise<Response> {
  const headers = new Headers({ Accept: "application/json", "Content-Type": file.type });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    return await fetch(url, { method: "POST", headers, credentials: "include", body: file });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, 0, "network");
  }
}

// Raw-body upload (no multipart): the request body is the file and
// Content-Type its declared type. `request()` only sends JSON, so this helper
// mirrors its bearer handling and one-time token renewal on 401.
export async function uploadAttachment(caseId: string, file: File): Promise<SupportUploadedFile> {
  const url = `${casePath(caseId, "/attachments")}?${new URLSearchParams({ filename: file.name })}`;
  const token = session.token;
  let response = await sendRaw(url, file, token);
  if (response.status === 401 && token) {
    const renewed = await refreshAccessToken();
    if (!renewed) {
      session.expire();
      throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, "session_expired");
    }
    response = await sendRaw(url, file, renewed);
  }
  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const code = errorCode(body);
    throw new ApiError(failureMessage(code, response.status), response.status, code);
  }
  return body as SupportUploadedFile;
}
