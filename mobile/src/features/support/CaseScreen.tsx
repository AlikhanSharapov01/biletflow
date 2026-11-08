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

// `/support/cases/[caseId]`: the conversation, case facts and staff tools.
export function CaseScreen() {
  const { caseId = "" } = useLocalSearchParams<{ caseId: string }>();
  const { profile } = useAuth();
  const viewerId = profile?.id ?? "";
  const { supportCase, loading, error, reload, refresh } = useSupportCase(caseId);
  const thread = useCaseUpdates(caseId, refresh);

  if (!supportCase) {
    return (
      <ScrollScreen backLabel="Support">
        {loading ? <LoadingState message="Loading case…" /> : null}
        {!loading ? (
          <ErrorPanel title="We couldn’t open this case." message={error ?? "This case could not be found."} onRetry={reload} />
        ) : null}
      </ScrollScreen>
    );
  }

  const requester = supportCase.viewer_roles.includes("requester");
  const staff = isStaff(supportCase);
  const resolved = supportCase.status === "resolved";
  const canReply = requester || !resolved;

  return (
    <ScrollScreen backLabel="Support">
      <PageHeading eyebrow={`Support · ${categoryLabel(supportCase.category)}`} title={supportCase.subject} />
      <CaseHeader supportCase={supportCase} />
      <Panel>
        <PanelHeading title="Conversation" />
        <Text style={styles.note}>
          {thread.error ? `Live updates paused: ${thread.error}` : "Updates appear here automatically."}
        </Text>
        {thread.loading && thread.items.length === 0 ? <LoadingState message="Loading messages…" /> : null}
        <CaseThread items={thread.items} viewerId={viewerId} />
        {canReply ? (
          <Composer
            caseId={supportCase.id}
            hint={resolved ? "This case is resolved. Replying reopens it." : undefined}
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
