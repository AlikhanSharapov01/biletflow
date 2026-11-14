import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { listCategories, listVenues } from "@/api/catalog";
import { listOrganizations } from "@/api/organizations";
import { ScrollScreen } from "@/components/layout";
import { ErrorPanel, LoadingState, PageHeading } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { useRequest } from "@/hooks/useRequest";

import { CreateOrganizationForm } from "./workspace/CreateOrganizationForm";
import { EventsPanel } from "./workspace/EventsPanel";
import { OrganizerNote } from "./workspace/OrganizerNote";
import { TeamPanel } from "./workspace/TeamPanel";
import { WorkspaceToolbar } from "./workspace/WorkspaceToolbar";
import { t, useLocale } from "@/i18n";

// Organizer tab: workspaces, their events and team (web OrganizerPage).
export function OrganizerScreen() {
  useLocale();
  const { profile } = useAuth();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState("");
  // Bumped on pull to refresh and when coming back from another screen, so
  // the panels reload with any new or changed events.
  const [refreshKey, setRefreshKey] = useState(0);
  const focusedBefore = useRef(false);

  const base = useRequest(async () => {
    const [organizations, categories, venues] = await Promise.all([listOrganizations(), listCategories(), listVenues()]);
    return { organizations, categories, venues };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) setRefreshKey((key) => key + 1);
      focusedBefore.current = true;
    }, []),
  );

  // Keep the selection valid as workspaces load or get created.
  useEffect(() => {
    const organizations = base.data?.organizations ?? [];
    if (!organizations.some((org) => org.id === organizationId)) {
      setOrganizationId(organizations[0]?.id ?? "");
    }
  }, [base.data, organizationId]);

  const refresh = () => {
    base.reload();
    setRefreshKey((key) => key + 1);
  };

  const heading = (
    <PageHeading
      eyebrow={t("nav.workspace")}
      title={t("org.bring_people")}
      subtitle={t("org.create_intro")}
    />
  );

  if (!base.data) {
    return (
      <ScrollScreen header="top" onRefresh={refresh}>
        {heading}
        {base.loading ? <LoadingState message={t("org.loading_workspace")} /> : null}
        {base.error ? <ErrorPanel title={t("org.workspace_error")} message={base.error} onRetry={base.reload} /> : null}
      </ScrollScreen>
    );
  }

  const { organizations, venues } = base.data;
  const organization = organizations.find((org) => org.id === organizationId) ?? null;
  const isOwner = Boolean(organization && profile && organization.owner_user_id === profile.id);

  return (
    <ScrollScreen header="top" onRefresh={refresh} refreshing={base.loading}>
      {heading}
      {organization ? (
        <>
          <WorkspaceToolbar
            organizations={organizations}
            organization={organization}
            isOwner={isOwner}
            onSelect={setOrganizationId}
            onNewEvent={() => router.push({ pathname: "/organizer/new-event", params: { organizationId: organization.id } })}
          />
          <EventsPanel key={`events-${organization.id}-${refreshKey}`} organization={organization} venues={venues} />
          <OrganizerNote eyebrow={t("org.first_step")} title={t("org.details_intro")}>
            {t("org.create_event_intro")}
          </OrganizerNote>
          <TeamPanel key={`team-${organization.id}-${refreshKey}`} organization={organization} isOwner={isOwner} />
        </>
      ) : (
        <>
          <CreateOrganizationForm
            defaultEmail={profile?.email ?? ""}
            onCreated={(org) => {
              setOrganizationId(org.id);
              base.reload();
            }}
          />
          <OrganizerNote eyebrow={t("nav.workspace")} title={t("org.your_events_title")}>
            {t("org.create_workspace_intro")}
          </OrganizerNote>
        </>
      )}
    </ScrollScreen>
  );
}
