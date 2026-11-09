import { t, useLocale } from "../../../i18n";
import { useEffect, useState } from "react";
import { listCategories, listVenues } from "../../../api/catalog";
import { listOrganizations } from "../../../api/organizations";
import { ErrorPanel, Loading, PageHeading, Panel, SelectField } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { useAuth } from "../../auth/AuthContext";
import { CreateEventPanel } from "./CreateEventPanel";
import { CreateOrganizationForm } from "./CreateOrganizationForm";
import { EventsPanel } from "./EventsPanel";
import { TeamPanel } from "./TeamPanel";

function OrganizerNote({ eyebrow, title, children }: { eyebrow: string; title: string; children: string }) {
  useLocale();
  return (
    <Panel as="aside" tone="note" className="organizer-note">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{children}</p>
    </Panel>
  );
}

export function OrganizerPage() {
  useLocale();
  const { profile } = useAuth();
  const [organizationId, setOrganizationId] = useState("");

  const base = useRequest(
    async () => {
      const [organizations, categories, venues] = await Promise.all([listOrganizations(), listCategories(), listVenues()]);
      return { organizations, categories, venues };
    },
    [],
  );

  // Keep the selection valid as workspaces load or get created.
  useEffect(() => {
    const organizations = base.data?.organizations ?? [];
    if (!organizations.some((org) => org.id === organizationId)) {
      setOrganizationId(organizations[0]?.id ?? "");
    }
  }, [base.data, organizationId]);

  if (base.loading) return <Loading label={t("org.loading_workspace")} />;
  if (base.error || !base.data) {
    return <ErrorPanel title={t("org.workspace_error")} message={base.error ?? ""} onRetry={base.reload} />;
  }

  const { organizations, categories, venues } = base.data;
  const organization = organizations.find((org) => org.id === organizationId) ?? null;
  const isOwner = Boolean(organization && profile && organization.owner_user_id === profile.id);

  return (
    <>
      <PageHeading
        eyebrow={t("nav.workspace")}
        title={t("org.bring_people")}
        subtitle={t("org.create_intro")}
      />
      {organization ? (
        <>
          <div className="org-toolbar">
            {organizations.length > 1 ? (
              <SelectField label={t("org.workspace")} className="org-picker" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </SelectField>
            ) : (
              <div className="org-heading">
                <strong>{organization.name}</strong>
                <span>
                  {organization.contact_email} · {isOwner ? t("org.owner") : t("org.team_member")}
                </span>
              </div>
            )}
          </div>
          <div className="content-grid">
            <div className="stack">
              <EventsPanel organization={organization} venues={venues} />
              <CreateEventPanel organization={organization} categories={categories} venues={venues} />
            </div>
            <div className="stack">
              <OrganizerNote eyebrow={t("org.first_step")} title={t("org.details_intro")}>{t("org.create_event_intro")}</OrganizerNote>
              <TeamPanel organization={organization} isOwner={isOwner} />
            </div>
          </div>
        </>
      ) : (
        <div className="content-grid">
          <CreateOrganizationForm
            defaultEmail={profile?.email ?? ""}
            onCreated={(org) => {
              setOrganizationId(org.id);
              base.reload();
            }}
          />
          <OrganizerNote eyebrow={t("nav.workspace")} title={t("org.your_events_title")}>{t("org.create_workspace_intro")}</OrganizerNote>
        </div>
      )}
    </>
  );
}
