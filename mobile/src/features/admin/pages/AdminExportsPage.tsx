import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { downloadExport } from "@/api/admin";
import { describeError } from "@/api/errors";
import type { ExportKind } from "@/api/types/admin";
import { Panel, PanelHeading, PrimaryButton, SelectField, TextField } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { SectionNote } from "@/features/admin/components/SectionNote";
import { colors, fonts } from "@/theme";

const KINDS: Array<{ value: ExportKind; label: string }> = [
  { value: "users", label: "Users" },
  { value: "events", label: "Events" },
  { value: "orders", label: "Orders" },
  { value: "tickets", label: "Tickets" },
];

// CSV exports with the same columns as the searches. Each export is audited;
// the file opens in the share sheet.
export function AdminExportsPage() {
  const { notify } = useToast();
  const [kind, setKind] = useState<ExportKind>("users");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState("1000");
  const [state, setState] = useState({ busy: false, message: "" });

  async function submit() {
    const rows = Number(limit);
    if (!Number.isInteger(rows) || rows < 1 || rows > 5000) {
      setState({ busy: false, message: "Choose between 1 and 5,000 rows." });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      await downloadExport(kind, { q, status, limit: rows });
      notify(`${kind}.csv downloaded.`);
      setState({ busy: false, message: "" });
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  }

  return (
    <Panel>
      <PanelHeading title="CSV exports" />
      <SectionNote text="Up to 5,000 rows. Cells that could run as spreadsheet formulas are made safe by the server. Every export is written to the audit log." />
      <View style={styles.form}>
        <SelectField label="Export" value={kind} options={KINDS} onChange={(next) => setKind(next as ExportKind)} />
        <TextField label="Rows" keyboardType="number-pad" value={limit} onChangeText={setLimit} />
        <TextField label="Search" hint="Optional" value={q} onChangeText={setQ} maxLength={100} autoCapitalize="none" />
        <TextField
          label="Status"
          hint="Optional, e.g. suspended or confirmed"
          value={status}
          onChangeText={setStatus}
          maxLength={32}
          autoCapitalize="none"
        />
        {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
        <PrimaryButton label={state.busy ? "Preparing…" : "Download CSV"} onPress={() => void submit()} loading={state.busy} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  message: { color: colors.error, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
});
