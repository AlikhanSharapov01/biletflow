import { t, useLocale } from "../../i18n";
import { useParams } from "react-router";
import { ErrorPanel, Loading, PageHeading, Panel, PanelHeading } from "../../components/ui";
import { useAuth } from "../auth/AuthContext";
import { CaseHeader } from "./components/CaseHeader";
import { CaseThread } from "./components/CaseThread";
import { Composer } from "./components/Composer";
import { StaffActions } from "./components/StaffActions";
import { categoryLabel, isStaff } from "./supportLabels";
import { useCaseUpdates } from "./useCaseUpdates";
import { useSupportCase } from "./useSupportCase";

// `/support/cases/:caseId`: the path the backend's support emails link to.
export function CasePage() {
  useLocale();
  const { caseId = "" } = useParams();
  const { profile } = useAuth();
  const viewerId = profile?.id ?? "";
  const { supportCase, loading, error, reload, refresh } = useSupportCase(caseId);
  const thread = useCaseUpdates(caseId, refresh);

  if (loading && !supportCase) return <Loading label={t("support.loading_case")} />;
  if (error || !supportCase) {
    return <ErrorPanel title={t("support.open_error")} message={error ?? t("support.case_missing")} onRetry={reload} />;
  }

  const requester = supportCase.viewer_roles.includes("requester");
  const staff = isStaff(supportCase);
  const resolved = supportCase.status === "resolved";
  const canReply = requester || !resolved;

  return (
    <>
      <PageHeading
        eyebrow={t("support.title_id", { p0: categoryLabel(supportCase.category) })}
        title={supportCase.subject}
        back={{ to: staff && !requester ? "/support?view=queue" : "/support", label: t("nav.support") }}
      />
      <div className="support-case-layout">
        <Panel className="support-conversation">
          <PanelHeading title={t("support.conversation")} subtitle={thread.error ? t("support.updates_paused", { p0: thread.error }) : t("support.automatic_updates")} />
          {thread.loading && thread.items.length === 0 ? <Loading label={t("support.loading_messages")} /> : null}
          <CaseThread items={thread.items} viewerId={viewerId} />
          {canReply ? (
            <Composer
              caseId={supportCase.id}
              hint={resolved ? t("support.closed_requester") : undefined}
              onSent={(message) => {
                thread.add(message);
                if (requester && (resolved || supportCase.status === "waiting_for_customer")) refresh();
              }}
            />
          ) : null}
        </Panel>
        <div className="support-case-side">
          <CaseHeader supportCase={supportCase} />
          {staff ? (
            <StaffActions
              key={`${supportCase.status}-${supportCase.assigned_to?.id ?? ""}-${supportCase.escalated_at ?? ""}`}
              supportCase={supportCase}
              viewerId={viewerId}
              onUpdated={(change) => {
                thread.add(change);
                refresh();
              }}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
