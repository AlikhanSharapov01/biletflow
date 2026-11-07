import { useState } from "react";
import { describeError } from "../../../api/errors";
import { acceptPaidSalesTerms, createIdentityVerification, createPayoutProfile, getPaidSales, startActivation } from "../../../api/paidSales";
import type { EventView } from "../../../api/types";
import { Button, ErrorPanel, ListRow, Loading, Panel, PanelHeading, StatusPill, useToast } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, priceLabel, statusLabel } from "../../../utils/format";
import { activationTone } from "../utils/paidSales";
import { ActivationFeeStep } from "./paid-sales/ActivationFeeStep";
import { SimulatedNote } from "./paid-sales/SimulatedNote";

// Simulated paid-sales activation checklist (backend/PAID_SALES_API.md).
export function PaidSalesTab({ event }: { event: EventView }) {
  const { notify } = useToast();
  const checklist = useRequest(() => getPaidSales(event.id), [event.id]);
  const [busy, setBusy] = useState("");

  const run = async (step: string, action: () => Promise<unknown>, done: string) => {
    setBusy(step);
    try {
      await action();
      notify(done);
      checklist.reload();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy("");
    }
  };

  if (checklist.loading && !checklist.data) return <Loading label="Loading paid-sales checklist…" />;
  if (checklist.error || !checklist.data) {
    return (
      <ErrorPanel
        title="We couldn’t load paid sales."
        message={`${checklist.error ?? ""} Only the workspace owner and members with the finance permission can manage paid sales.`}
        onRetry={checklist.reload}
      />
    );
  }
  const data = checklist.data;
  const done = (ok: boolean) => <StatusPill tone={ok ? "positive" : "pending"}>{ok ? "Done" : "To do"}</StatusPill>;

  return (
    <div className="stack">
      <SimulatedNote />
      <Panel>
        <PanelHeading
          title="Paid-sales activation"
          subtitle="Every step must be complete before paid ticket types can be sold. Free tickets keep working either way."
          trailing={<StatusPill tone={activationTone(data.status)}>{statusLabel(data.status)}</StatusPill>}
        />
        {data.status === "active" ? <p className="form-intro">Paid sales are active since {dateLabel(data.activated_at)}.</p> : null}
        {data.status === "suspended" ? (
          <p className="form-message" role="alert">
            Paid sales were suspended by the platform{data.suspension_reason ? `: ${data.suspension_reason}` : "."} Contact support to reinstate them.
          </p>
        ) : null}
        <div className="list checklist">
          <ListRow
            icon="₸"
            title="Paid ticket type"
            meta="Add at least one ticket type of kind “Paid” in the Ticket types tab."
            actions={done(data.paid_ticket_type)}
          />
          <ListRow
            icon="P"
            title="Payout profile"
            meta="Simulated and verified immediately. No bank details are collected."
            actions={
              data.payout_profile_verified ? done(true) : (
                <Button size="sm" disabled={Boolean(busy)} onClick={() => void run("payout", () => createPayoutProfile(event.organization_id), "Simulated payout profile created.")}>
                  Create simulated profile
                </Button>
              )
            }
          />
          <ListRow
            icon="ID"
            title="Identity verification"
            meta="Simulated approval for this workspace. No documents are uploaded."
            actions={
              data.identity_verified ? done(true) : (
                <Button size="sm" disabled={Boolean(busy)} onClick={() => void run("identity", () => createIdentityVerification(event.organization_id), "Simulated identity check approved.")}>
                  Verify (simulated)
                </Button>
              )
            }
          />
          <ListRow
            icon="T"
            title={`Organizer terms · version ${data.terms.version}`}
            meta="Accepted per event and per terms version."
            actions={
              data.terms.accepted ? done(true) : (
                <Button size="sm" disabled={Boolean(busy)} onClick={() => void run("terms", () => acceptPaidSalesTerms(event.id, data.terms.version), "Terms accepted.")}>
                  Accept terms
                </Button>
              )
            }
          >
            <details className="terms-text">
              <summary>Read the terms</summary>
              <p>{data.terms.text}</p>
            </details>
          </ListRow>
          <ActivationFeeStep
            checklist={data}
            busy={Boolean(busy)}
            onStart={() => void run("fee", () => startActivation(event.id), "Simulated activation payment started.")}
            onChanged={checklist.reload}
          />
        </div>
        <p className="form-intro">
          Activation fee: {priceLabel(data.activation_fee_minor)} {data.currency} (demonstration value). Activation applies to this event only and is never copied by Duplicate.
        </p>
      </Panel>
    </div>
  );
}
