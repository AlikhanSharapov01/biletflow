import { request } from "./client";
import type { Invitation, MemberDetail, Organization, OrganizationCreate } from "./types";

const id = encodeURIComponent;

// Organizer workspaces, their members and email invitations.

export function listOrganizations(): Promise<Organization[]> {
  return request<Organization[]>("/api/v1/organizations");
}

export function createOrganization(data: OrganizationCreate): Promise<Organization> {
  return request<Organization>("/api/v1/organizations", { method: "POST", body: data });
}

export function listMembers(organizationId: string): Promise<MemberDetail[]> {
  return request<MemberDetail[]>(`/api/v1/organizations/${id(organizationId)}/members`, { query: { limit: 100 } });
}

export function revokeMember(organizationId: string, memberId: string): Promise<unknown> {
  return request(`/api/v1/organizations/${id(organizationId)}/members/${id(memberId)}`, { method: "DELETE" });
}

export function listInvitations(organizationId: string): Promise<Invitation[]> {
  return request<Invitation[]>(`/api/v1/organizations/${id(organizationId)}/invitations`, { query: { limit: 100 } });
}

export function inviteMember(organizationId: string, email: string): Promise<Invitation> {
  return request<Invitation>(`/api/v1/organizations/${id(organizationId)}/invitations`, {
    method: "POST",
    body: { email },
  });
}

export function revokeInvitation(organizationId: string, invitationId: string): Promise<unknown> {
  return request(`/api/v1/organizations/${id(organizationId)}/invitations/${id(invitationId)}`, { method: "DELETE" });
}

export function acceptInvitation(token: string): Promise<unknown> {
  return request("/api/v1/staff-invitations/accept", { method: "POST", body: { token } });
}
