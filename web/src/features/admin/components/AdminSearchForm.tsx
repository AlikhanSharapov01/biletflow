import { t, useLocale } from "../../../i18n";
import { useState, type FormEvent } from "react";
import { Button, SelectField, TextField } from "../../../components/ui";
import type { SearchQuery } from "../hooks/useAdminSearch";

interface AdminSearchFormProps {
  label: string;
  placeholder: string;
  statuses: Array<{ value: string; label: string }>;
  statusLabel?: string;
  onApply: (query: SearchQuery) => void;
}

// Search text is matched literally by the server (% and _ are not wildcards).
export function AdminSearchForm({ label, placeholder, statuses, statusLabel = t("common.status"), onApply }: AdminSearchFormProps) {
  useLocale();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply({ q: q.trim(), status });
  };

  return (
    <form className="filter-bar" role="search" aria-label={label} onSubmit={submit}>
      <TextField label={t("common.search")} className="filter-wide" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} placeholder={placeholder} />
      <SelectField label={statusLabel} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">{t("admin.any")}</option>
        {statuses.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </SelectField>
      <div className="filter-actions">
        <Button variant="primary" size="sm" type="submit">{t("common.search")}</Button>
      </div>
    </form>
  );
}
