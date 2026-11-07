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
  return (
    <Panel as="aside" tone="note" className="organizer-note">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{children}</p>
    </Panel>
  );
}

export function OrganizerPage() {
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

  if (base.loading) return <Loading label="Loading organizer workspace…" />;
  if (base.error || !base.data) {
    return <ErrorPanel title="We couldn’t load the organizer workspace." message={base.error ?? ""} onRetry={base.reload} />;
  }

  const { organizations, categories, venues } = base.data;
  const organization = organizations.find((org) => org.id === organizationId) ?? null;
  const isOwner = Boolean(organization && profile && organization.owner_user_id === profile.id);

  return (
    <>
      <PageHeading
        eyebrow="Organizer workspace"
        title="Bring people together."
        subtitle="Create an organization, prepare events, and publish your next gathering."
      />
      {organization ? (
        <>
          <div className="org-toolbar">
            {organizations.length > 1 ? (
              <SelectField label="Workspace" className="org-picker" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
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
                  {organization.contact_email} · {isOwner ? "You own this workspace" : "You are a team member"}
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
              <OrganizerNote eyebrow="A good first step" title="Make the details easy to find.">
                Choose a venue and category, set your event dates, then publish when your listing is ready for guests.
              </OrganizerNote>
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
          <OrganizerNote eyebrow="Organizer workspace" title="Your events start here.">
            Create your organization to manage event listings and bring your community together.
          </OrganizerNote>
        </div>
      )}
    </>
  );
}
