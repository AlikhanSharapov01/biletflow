import { useState } from "react";

import { describeError } from "@/api/errors";
import { acceptPaidSalesTerms, createIdentityVerification, createPayoutProfile, getPaidSales, startActivation } from "@/api/paidSales";
import type { EventView } from "@/api/types";
import { ErrorPanel, ListRow, LoadingState, Panel, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel, priceLabel, statusLabel } from "@/utils/format";

import { FormMessage } from "@/components/ui/FormMessage";
import { Intro } from "../components/Intro";
import { SectionHeading } from "../components/SectionHeading";
import { SimulatedNote } from "../components/SimulatedNote";
import { activationTone } from "../utils/paidSales";
import { ActivationFeeStep } from "./paid-sales/ActivationFeeStep";
import { StepDone } from "./paid-sales/StepDone";
import { TermsStep } from "./paid-sales/TermsStep";

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

  if (checklist.loading && !checklist.data) return <LoadingState message="Loading paid-sales checklist…" />;
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

  return (
    <>
      <SimulatedNote />
      <Panel>
        <SectionHeading
          title="Paid-sales activation"
          subtitle="Every step must be complete before paid ticket types can be sold. Free tickets keep working either way."
          trailing={<StatusPill tone={activationTone(data.status)} label={statusLabel(data.status)} />}
        />
        {data.status === "active" ? <Intro>Paid sales are active since {dateLabel(data.activated_at)}.</Intro> : null}
        {data.status === "suspended" ? (
          <FormMessage
            message={`Paid sales were suspended by the platform${data.suspension_reason ? `: ${data.suspension_reason}` : "."} Contact support to reinstate them.`}
          />
        ) : null}
        <ListRow icon="₸" title="Paid ticket type" meta="Add at least one ticket type of kind “Paid” in the Ticket types tab." trailing={<StepDone done={data.paid_ticket_type} />} />
        <ListRow
          icon="P"
          title="Payout profile"
          meta="Simulated and verified immediately. No bank details are collected."
          trailing={
            data.payout_profile_verified ? <StepDone done /> : (
              <SubtleButton
                label="Create simulated profile"
                disabled={Boolean(busy)}
                onPress={() => void run("payout", () => createPayoutProfile(event.organization_id), "Simulated payout profile created.")}
              />
            )
          }
        />
        <ListRow
          icon="ID"
          title="Identity verification"
          meta="Simulated approval for this workspace. No documents are uploaded."
          trailing={
            data.identity_verified ? <StepDone done /> : (
              <SubtleButton
                label="Verify (simulated)"
                disabled={Boolean(busy)}
                onPress={() => void run("identity", () => createIdentityVerification(event.organization_id), "Simulated identity check approved.")}
              />
            )
          }
        />
        <TermsStep
          terms={data.terms}
          busy={Boolean(busy)}
          onAccept={() => void run("terms", () => acceptPaidSalesTerms(event.id, data.terms.version), "Terms accepted.")}
        />
        <ActivationFeeStep
          checklist={data}
          busy={Boolean(busy)}
          onStart={() => void run("fee", () => startActivation(event.id), "Simulated activation payment started.")}
          onChanged={checklist.reload}
        />
        <Intro style={{ marginTop: 12 }}>
          Activation fee: {priceLabel(data.activation_fee_minor)} {data.currency} (demonstration value). Activation applies to this event only and is never
          copied by Duplicate.
        </Intro>
      </Panel>
    </>
  );
}
