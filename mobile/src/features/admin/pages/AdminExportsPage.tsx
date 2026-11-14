import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { downloadExport } from "@/api/admin";
import { describeError } from "@/api/errors";
import type { ExportKind } from "@/api/types/admin";
import { Panel, PanelHeading, PrimaryButton, SelectField, TextField } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { SectionNote } from "@/features/admin/components/SectionNote";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

const KINDS: Array<{ value: ExportKind; label: string }> = [
  { value: "users", get label() { return t("admin.users"); } },
  { value: "events", get label() { return t("common.events"); } },
  { value: "orders", get label() { return t("common.orders"); } },
  { value: "tickets", get label() { return t("common.tickets"); } },
];

// CSV exports with the same columns as the searches. Each export is audited;
// the file opens in the share sheet.
export function AdminExportsPage() {
  useLocale();
  const { notify } = useToast();
  const [kind, setKind] = useState<ExportKind>("users");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState("1000");
  const [state, setState] = useState({ busy: false, message: "" });

  async function submit() {
    const rows = Number(limit);
    if (!Number.isInteger(rows) || rows < 1 || rows > 5000) {
      setState({ busy: false, message: t("admin.export_rows_validation") });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      await downloadExport(kind, { q, status, limit: rows });
      notify(t("admin.csv_downloaded", { p0: kind }));
      setState({ busy: false, message: "" });
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  }

  return (
    <Panel>
      <PanelHeading title={t("admin.exports")} />
      <SectionNote text={t("admin.exports_hint")} />
      <View style={styles.form}>
        <SelectField label={t("admin.export")} value={kind} options={KINDS} onChange={(next) => setKind(next as ExportKind)} />
        <TextField label={t("admin.rows")} keyboardType="number-pad" value={limit} onChangeText={setLimit} />
        <TextField label={t("common.search")} hint={t("common.optional")} value={q} onChangeText={setQ} maxLength={100} autoCapitalize="none" />
        <TextField
          label={t("common.status")}
          hint={t("admin.optional_status")}
          value={status}
          onChangeText={setStatus}
          maxLength={32}
          autoCapitalize="none"
        />
        {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
        <PrimaryButton label={state.busy ? t("support.preparing") : t("org.csv_download")} onPress={() => void submit()} loading={state.busy} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  message: { color: colors.error, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
});
