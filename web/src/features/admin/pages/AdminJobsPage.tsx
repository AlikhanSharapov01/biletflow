import { t, useLocale } from "../../../i18n";
import { useMemo, useState, type FormEvent } from "react";
import { listDeliveries, listJobs, retryDelivery, retryJob } from "../../../api/admin";
import { ADMIN_RETRY_LIMIT, type AdminDelivery, type AdminJob, type WorkFilters } from "../../../api/types/admin";
import { Button, Panel, PanelHeading, SelectField, StatusPill, Tabs, TextField, useToast } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, statusLabel } from "../../../utils/format";
import type { StatusTone } from "../../../utils/status";
import { createRetryKeys } from "../../support/retryKey";
import { ReasonForm } from "../components/ReasonForm";
import { SearchResults } from "../components/SearchResults";

type View = "jobs" | "deliveries";
type WorkRow = AdminJob | AdminDelivery;

const LIMIT = 25;
const JOB_STATUSES = ["pending", "leased", "done", "dead"];
const DELIVERY_STATUSES = ["pending", "sent", "failed"];

function tone(status: string): StatusTone {
  if (status === "done" || status === "sent") return "positive";
  if (status === "dead" || status === "failed") return "blocked";
  return "pending";
}

// Why a row offers no retry, in the order the backend checks it.
export function retryBlocker(row: WorkRow): string | null {
  if (row.retryable) return null;
  if (row.status === "done" || row.status === "sent") return t("admin.retry_done");
  if (row.status === "pending" || row.status === "leased") return t("admin.retry_worker_owns");
  if (row.admin_retry_count >= ADMIN_RETRY_LIMIT) return t("admin.retry_limit", { p0: ADMIN_RETRY_LIMIT });
  return t("admin.retry_unsupported");
}

function attempts(row: WorkRow): string {
  return row.max_attempts === null ? String(row.attempt_count) : `${row.attempt_count} / ${row.max_attempts}`;
}

// Background jobs and notification deliveries with the bounded admin retry
// (ADMIN_API.md "Background work and deliveries"). A retry needs a reason,
// sends one exhausted row back to the worker and is capped at three per row.
export function AdminJobsPage() {
  useLocale();
  const { notify } = useToast();
  const [view, setView] = useState<View>("jobs");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [filters, setFilters] = useState<WorkFilters>({});
  const [offset, setOffset] = useState(0);
  const [retrying, setRetrying] = useState("");
  const keys = useMemo(() => createRetryKeys(), []);
  const result = useRequest<{ items: WorkRow[]; total: number; limit: number; offset: number }>(
    () => (view === "jobs" ? listJobs(filters, LIMIT, offset) : listDeliveries(filters, LIMIT, offset)),
    [view, filters, offset],
  );

  const switchView = (next: View) => {
    setView(next);
    setStatus("");
    setKind("");
    setFilters({});
    setOffset(0);
    setRetrying("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters({ status: status || undefined, kind: kind.trim() || undefined });
    setOffset(0);
  };

  const retry = async (row: WorkRow, reason: string) => {
    const key = keys.keyFor({ view, id: row.id, reason });
    if (view === "jobs") await retryJob(row.id, reason, key);
    else await retryDelivery(row.id, reason, key);
    keys.reset();
    setRetrying("");
    notify(t("admin.retry_sent"));
    result.reload();
  };

  const statuses = view === "jobs" ? JOB_STATUSES : DELIVERY_STATUSES;
  const noun = view === "jobs" ? t("admin.jobs_noun") : t("admin.deliveries_noun");

  return (
    <Panel>
      <PanelHeading title={t("admin.jobs")} subtitle={t("admin.jobs_hint")} />
      <Tabs
        label={t("admin.jobs")}
        items={[
          { id: "jobs", label: t("admin.jobs_tab") },
          { id: "deliveries", label: t("admin.deliveries_tab") },
        ]}
        value={view}
        onChange={switchView}
      />
      <form className="filter-bar" role="search" aria-label={noun} onSubmit={submit}>
        <SelectField label={t("common.status")} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t("admin.any")}</option>
          {statuses.map((value) => (
            <option key={value} value={value}>{statusLabel(value)}</option>
          ))}
        </SelectField>
        <TextField label={t("admin.job_kind")} value={kind} maxLength={64} placeholder={t("admin.job_kind_placeholder")} onChange={(event) => setKind(event.target.value)} />
        <div className="filter-actions">
          <Button variant="primary" size="sm" type="submit">{t("common.search")}</Button>
        </div>
      </form>
      <SearchResults noun={noun} {...result} offset={offset} onPage={setOffset}>
        {(items) => (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("admin.job_kind")}</th>
                  <th scope="col">{t("common.status")}</th>
                  <th scope="col">{t("admin.job_attempts")}</th>
                  <th scope="col">{t("admin.job_admin_retries")}</th>
                  <th scope="col">{t("admin.job_last_error")}</th>
                  <th scope="col">{t("admin.created")}</th>
                  <th scope="col">
                    <span className="visually-hidden">{t("admin.retry")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const blocker = retryBlocker(row);
                  return (
                    <tr key={row.id}>
                      <td>
                        {statusLabel(row.kind)}
                        <small className="cell-note">
                          <code className="id-code">{row.id.slice(0, 8)}</code>
                          {"channel" in row ? ` · ${statusLabel(row.channel)}` : ""}
                        </small>
                      </td>
                      <td>
                        <StatusPill tone={tone(row.status)}>{statusLabel(row.status)}</StatusPill>
                      </td>
                      <td>{attempts(row)}</td>
                      <td>{`${row.admin_retry_count} / ${ADMIN_RETRY_LIMIT}`}</td>
                      <td>{row.last_error ? <code className="id-code">{row.last_error}</code> : t("admin.none")}</td>
                      <td>{dateLabel(row.created_at)}</td>
                      <td>
                        {blocker ? (
                          <small className="cell-note">{blocker}</small>
                        ) : retrying === row.id ? (
                          <ReasonForm
                            label={t("admin.retry_reason")}
                            submitLabel={t("admin.retry")}
                            onCancel={() => setRetrying("")}
                            onSubmit={(reason) => retry(row, reason)}
                          />
                        ) : (
                          <Button size="sm" onClick={() => setRetrying(row.id)}>{t("admin.retry")}</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SearchResults>
    </Panel>
  );
}
