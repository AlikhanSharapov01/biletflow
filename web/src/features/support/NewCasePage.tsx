import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { describeError } from "../../api/errors";
import { openCase } from "../../api/support";
import {
  SUPPORT_CATEGORIES,
  type SupportCaseCreate,
  type SupportCaseKind,
  type SupportCategory,
} from "../../api/types/support";
import { Button, FormMessage, PageHeading, Panel, SelectField, TextAreaField, TextField, useToast } from "../../components/ui";
import { ContextChips } from "./components/ContextChips";
import { OrderPicker, OrganizationPicker } from "./components/ContextPicker";
import { createRetryKeys } from "./retryKey";
import { CATEGORY_LABELS, KIND_LABELS, contextFromParams, hasContext } from "./supportLabels";

export function NewCasePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const linked = useMemo(() => contextFromParams(params), [params]);
  const recordLinked = Boolean(linked.event_id || linked.order_id || linked.ticket_id);
  const [kind, setKind] = useState<SupportCaseKind>(linked.organization_id && !recordLinked ? "organizer_platform" : "attendee");
  const [category, setCategory] = useState<SupportCategory>("delivery");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [orderId, setOrderId] = useState("");
  const [organizationId, setOrganizationId] = useState(linked.organization_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keys = useMemo(() => createRetryKeys(), []);

  const buildPayload = (): Omit<SupportCaseCreate, "client_message_id"> => {
    const base = { kind, category, subject: subject.trim(), body: body.trim() };
    if (kind === "organizer_platform") return { ...base, organization_id: organizationId, event_id: linked.event_id };
    if (recordLinked) return { ...base, event_id: linked.event_id, order_id: linked.order_id, ticket_id: linked.ticket_id };
    return { ...base, order_id: orderId };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = buildPayload();
    if (!payload.subject || !payload.body) {
      setError("Add a subject and describe what happened.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await openCase({ ...payload, client_message_id: keys.keyFor(payload) });
      notify(created.message.replayed ? "This case was already opened." : "Support case opened.");
      navigate(`/support/cases/${encodeURIComponent(created.case.id)}`, { replace: true });
    } catch (failure) {
      setError(describeError(failure));
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="Support"
        title="New case."
        subtitle="Tell us what went wrong. You can add screenshots or PDFs after the case is open."
        back={{ to: "/support", label: "Support" }}
      />
      <Panel as="div" className="support-form-panel">
        <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
          {hasContext(linked) ? (
            <div className="field">
              <span className="field-label">About</span>
              <ContextChips context={linked} />
            </div>
          ) : null}
          <SelectField label="What is this about?" value={kind} onChange={(event) => setKind(event.target.value as SupportCaseKind)}>
            <option value="attendee">{KIND_LABELS.attendee}</option>
            <option value="organizer_platform">{KIND_LABELS.organizer_platform}</option>
          </SelectField>
          {kind === "attendee" && !recordLinked ? <OrderPicker value={orderId} onChange={setOrderId} /> : null}
          {kind === "organizer_platform" && !linked.organization_id ? (
            <OrganizationPicker value={organizationId} onChange={setOrganizationId} />
          ) : null}
          <SelectField label="Category" value={category} onChange={(event) => setCategory(event.target.value as SupportCategory)}>
            {SUPPORT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </SelectField>
          <TextField label="Subject" value={subject} maxLength={200} required onChange={(event) => setSubject(event.target.value)} />
          <TextAreaField
            label="Message"
            hint="Up to 5,000 characters"
            value={body}
            maxLength={5000}
            rows={6}
            required
            onChange={(event) => setBody(event.target.value)}
          />
          {error ? <FormMessage message={error} /> : null}
          <div className="form-actions">
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? "Opening…" : "Open case"}
            </Button>
          </div>
        </form>
      </Panel>
    </>
  );
}
