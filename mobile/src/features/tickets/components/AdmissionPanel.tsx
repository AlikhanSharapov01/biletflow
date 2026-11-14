import { StyleSheet, Text } from "react-native";

import { getAdmission } from "@/api/tickets";
import { ErrorPanel, FactList, LoadingState, Panel, PanelHeading, StatusPill, TextButton } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";
import { colors, fonts } from "@/theme";
import { dateLabel } from "@/utils/format";

import { admissionSummary } from "../utils/ticketStatus";
import { t, useLocale } from "@/i18n";

// "Am I checked in?" from GET /tickets/{id}/admission.
export function AdmissionPanel({ ticketId }: { ticketId: string }) {
  useLocale();
  const admission = useRequest(() => getAdmission(ticketId), [ticketId]);
  const summary = admission.data ? admissionSummary(admission.data) : null;

  return (
    <Panel>
      <PanelHeading title={t("tickets.admission")} trailing={summary ? <StatusPill tone={summary.tone} label={summary.label} /> : null} />
      {admission.loading && !admission.data ? <LoadingState message={t("tickets.checking_admission")} /> : null}
      {admission.error ? (
        <ErrorPanel title={t("tickets.admission_error")} message={admission.error} onRetry={admission.reload} />
      ) : null}
      {admission.data && summary ? (
        <>
          <Text style={styles.copy}>{summary.detail}</Text>
          <FactList
            items={[
              {
                label: t("event.doors"),
                value: `${dateLabel(admission.data.admission_window.opens_at)} – ${dateLabel(admission.data.admission_window.closes_at)}`,
              },
              ...(admission.data.checked_in_at ? [{ label: t("tickets.checked_in"), value: dateLabel(admission.data.checked_in_at) }] : []),
              ...(admission.data.reversed_at ? [{ label: t("tickets.reversed"), value: dateLabel(admission.data.reversed_at) }] : []),
            ]}
          />
          <TextButton label={t("common.refresh")} onPress={admission.reload} style={styles.action} />
        </>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  copy: { marginBottom: 6, color: colors.muted, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  action: { alignSelf: "flex-start", marginTop: 8 },
});
