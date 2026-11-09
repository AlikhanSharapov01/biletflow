import { t, useLocale } from "../../../i18n";
import { useState, type FormEvent } from "react";
import { downloadExport } from "../../../api/admin";
import { describeError } from "../../../api/errors";
import type { ExportKind } from "../../../api/types/admin";
import { Button, FormMessage, Panel, PanelHeading, SelectField, TextField, useToast } from "../../../components/ui";

const KINDS: Array<{ id: ExportKind; label: string }> = [
  { id: "users", get label() { return t("admin.users"); } },
  { id: "events", get label() { return t("common.events"); } },
  { id: "orders", get label() { return t("common.orders"); } },
  { id: "tickets", get label() { return t("common.tickets"); } },
];

// CSV exports with the same columns as the searches. Each export is audited.
export function AdminExportsPage() {
  useLocale();
  const { notify } = useToast();
  const [kind, setKind] = useState<ExportKind>("users");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState("1000");
  const [state, setState] = useState({ busy: false, message: "" });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
  };

  return (
    <Panel>
      <PanelHeading title={t("admin.exports")} subtitle={t("admin.exports_hint")} />
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <SelectField label={t("admin.export")} value={kind} onChange={(e) => setKind(e.target.value as ExportKind)}>
            {KINDS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </SelectField>
          <TextField label={t("admin.rows")} type="number" min={1} max={5000} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <div className="form-grid">
          <TextField label={t("common.search")} hint={t("common.optional")} value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
          <TextField label={t("common.status")} hint={t("admin.optional_status")} value={status} onChange={(e) => setStatus(e.target.value)} maxLength={32} />
        </div>
        <FormMessage message={state.message} />
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={state.busy}>
            {state.busy ? t("support.preparing") : t("org.csv_download")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
