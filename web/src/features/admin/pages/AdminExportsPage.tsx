import { useState, type FormEvent } from "react";
import { downloadExport } from "../../../api/admin";
import { describeError } from "../../../api/errors";
import type { ExportKind } from "../../../api/types/admin";
import { Button, FormMessage, Panel, PanelHeading, SelectField, TextField, useToast } from "../../../components/ui";

const KINDS: Array<{ id: ExportKind; label: string }> = [
  { id: "users", label: "Users" },
  { id: "events", label: "Events" },
  { id: "orders", label: "Orders" },
  { id: "tickets", label: "Tickets" },
];

// CSV exports with the same columns as the searches. Each export is audited.
export function AdminExportsPage() {
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
  };

  return (
    <Panel>
      <PanelHeading title="CSV exports" subtitle="Up to 5,000 rows. Cells that could run as spreadsheet formulas are made safe by the server. Every export is written to the audit log." />
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <SelectField label="Export" value={kind} onChange={(e) => setKind(e.target.value as ExportKind)}>
            {KINDS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </SelectField>
          <TextField label="Rows" type="number" min={1} max={5000} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <div className="form-grid">
          <TextField label="Search" hint="Optional" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
          <TextField label="Status" hint="Optional, e.g. suspended or confirmed" value={status} onChange={(e) => setStatus(e.target.value)} maxLength={32} />
        </div>
        <FormMessage message={state.message} />
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={state.busy}>
            {state.busy ? "Preparing…" : "Download CSV"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
