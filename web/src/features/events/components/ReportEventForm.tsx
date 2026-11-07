import { useState, type FormEvent } from "react";
import { describeError } from "../../../api/errors";
import { reportEvent, type ReportCategory } from "../../../api/reports";
import { Button, FormMessage, SelectField, TextAreaField } from "../../../components/ui";

const CATEGORIES: Array<{ value: ReportCategory; label: string }> = [
  { value: "misleading", label: "Misleading information" },
  { value: "fraud", label: "Fraud or scam" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "safety", label: "Safety concern" },
  { value: "other", label: "Something else" },
];

// A small disclosure for signed-in users; platform admins review reports.
export function ReportEventForm({ eventId }: { eventId: string }) {
  const [category, setCategory] = useState<ReportCategory>("misleading");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", success: false });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!description.trim()) {
      setMessage({ text: "Describe what is wrong with this event.", success: false });
      return;
    }
    setBusy(true);
    setMessage({ text: "", success: false });
    try {
      const receipt = await reportEvent(eventId, { category, description: description.trim() });
      setMessage({
        text: receipt.duplicate
          ? "You already reported this event for that reason. Our team is reviewing it."
          : "Thanks. Your report was sent to the BiletFlow team.",
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
      <summary>Report this event</summary>
      <form className="form-stack" onSubmit={(e) => void submit(e)}>
        <SelectField label="Reason" value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)}>
          {CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </SelectField>
        <TextAreaField label="What is wrong?" value={description} maxLength={2000} rows={4} required onChange={(e) => setDescription(e.target.value)} />
        <FormMessage message={message.text} success={message.success} />
        <div className="form-actions">
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? "Sending…" : "Send report"}
          </Button>
        </div>
      </form>
    </details>
  );
}
