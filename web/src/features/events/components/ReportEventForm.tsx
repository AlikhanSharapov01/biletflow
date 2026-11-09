import { t, useLocale } from "../../../i18n";
import { useState, type FormEvent } from "react";
import { describeError } from "../../../api/errors";
import { reportEvent, type ReportCategory } from "../../../api/reports";
import { Button, FormMessage, SelectField, TextAreaField } from "../../../components/ui";

const CATEGORIES: Array<{ value: ReportCategory; label: string }> = [
  { value: "misleading", get label() { return t("event.report_misleading"); } },
  { value: "fraud", get label() { return t("event.report_fraud"); } },
  { value: "spam", get label() { return t("event.report_spam"); } },
  { value: "inappropriate", get label() { return t("event.report_content"); } },
  { value: "safety", get label() { return t("event.report_safety"); } },
  { value: "other", get label() { return t("event.report_other"); } },
];

// A small disclosure for signed-in users; platform admins review reports.
export function ReportEventForm({ eventId }: { eventId: string }) {
  useLocale();
  const [category, setCategory] = useState<ReportCategory>("misleading");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", success: false });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!description.trim()) {
      setMessage({ text: t("event.report_details"), success: false });
      return;
    }
    setBusy(true);
    setMessage({ text: "", success: false });
    try {
      const receipt = await reportEvent(eventId, { category, description: description.trim() });
      setMessage({
        text: receipt.duplicate
          ? t("event.already_reported")
          : t("event.report_sent"),
        success: true,
      });
      setDescription("");
    } catch (failure) {
      setMessage({ text: describeError(failure), success: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="form-details report-event">
      <summary>{t("event.report")}</summary>
      <form className="form-stack" onSubmit={(e) => void submit(e)}>
        <SelectField label={t("common.reason")} value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)}>
          {CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </SelectField>
        <TextAreaField label={t("event.report_question")} value={description} maxLength={2000} rows={4} required onChange={(e) => setDescription(e.target.value)} />
        <FormMessage message={message.text} success={message.success} />
        <div className="form-actions">
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? t("common.sending") : t("event.send_report")}
          </Button>
        </div>
      </form>
    </details>
  );
}
