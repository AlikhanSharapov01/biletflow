import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { ScrollScreen } from "@/components/layout";
import { ErrorPanel, LoadingState, PageHeading, Panel, PanelHeading } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { colors, fonts } from "@/theme";

import { CaseHeader } from "./components/CaseHeader";
import { CaseThread } from "./components/CaseThread";
import { Composer } from "./components/Composer";
import { StaffActions } from "./components/StaffActions";
import { useCaseUpdates } from "./hooks/useCaseUpdates";
import { useSupportCase } from "./hooks/useSupportCase";
import { categoryLabel, isStaff } from "./utils/supportLabels";
import { t, useLocale } from "@/i18n";

// `/support/cases/[caseId]`: the conversation, case facts and staff tools.
export function CaseScreen() {
  useLocale();
  const { caseId = "" } = useLocalSearchParams<{ caseId: string }>();
  const { profile } = useAuth();
  const viewerId = profile?.id ?? "";
  const { supportCase, loading, error, reload, refresh } = useSupportCase(caseId);
  const thread = useCaseUpdates(caseId, refresh);

  if (!supportCase) {
    return (
      <ScrollScreen backLabel={t("nav.support")}>
        {loading ? <LoadingState message={t("support.loading_case")} /> : null}
        {!loading ? (
          <ErrorPanel title={t("support.open_error")} message={error ?? t("support.case_missing")} onRetry={reload} />
        ) : null}
      </ScrollScreen>
    );
  }

  const requester = supportCase.viewer_roles.includes("requester");
  const staff = isStaff(supportCase);
  const resolved = supportCase.status === "resolved";
  const canReply = requester || !resolved;

  return (
    <ScrollScreen backLabel={t("nav.support")}>
      <PageHeading eyebrow={t("support.title_id", { p0: categoryLabel(supportCase.category) })} title={supportCase.subject} />
      <CaseHeader supportCase={supportCase} />
      <Panel>
        <PanelHeading title={t("support.conversation")} />
        <Text style={styles.note}>
          {thread.error ? t("support.updates_paused", { p0: thread.error }) : t("support.automatic_updates")}
        </Text>
        {thread.loading && thread.items.length === 0 ? <LoadingState message={t("support.loading_messages")} /> : null}
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
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: -8, marginBottom: 12, color: colors.faint, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
});
