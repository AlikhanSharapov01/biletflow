import { t, useLocale } from "../../../i18n";
import { dateLabel } from "../../../utils/format";

// Read-only rendering of an inspection detail as the server sent it
// (ADMIN_API.md "Operational inspection"). Field names come from the API and
// are shown as-is, made readable; nothing here can change a record.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function fieldLabel(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Scalar({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="cell-note">{t("common.not_available")}</span>;
  if (typeof value === "boolean") return <>{value ? t("common.yes") : t("common.no")}</>;
  if (typeof value === "string" && ISO_DATE.test(value)) return <time dateTime={value}>{dateLabel(value)}</time>;
  return <>{String(value)}</>;
}

function RecordTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">{fieldLabel(column)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={typeof row.id === "string" ? row.id : index}>
              {columns.map((column) => (
                <td key={column}>
                  <RecordValue value={row[column]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecordValue({ value }: { value: unknown }) {
  useLocale();
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="cell-note">{t("admin.none")}</span>;
    if (value.every(isRecord)) return <RecordTable rows={value} />;
    return <>{value.map((item) => String(item)).join(", ")}</>;
  }
  if (isRecord(value)) return <RecordView record={value} />;
  return <Scalar value={value} />;
}

export function RecordView({ record }: { record: Record<string, unknown> }) {
  useLocale();
  const entries = Object.entries(record);
  if (entries.length === 0) return <span className="cell-note">{t("admin.none")}</span>;
  return (
    <dl className="record-view">
      {entries.map(([key, value]) => (
        <div key={key} className="record-view-row">
          <dt>{fieldLabel(key)}</dt>
          <dd>
            <RecordValue value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
