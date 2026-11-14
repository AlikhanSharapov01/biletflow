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
import { t, useLocale } from "@/i18n";

// Simulated paid-sales activation checklist (backend/PAID_SALES_API.md).
export function PaidSalesTab({ event }: { event: EventView }) {
  useLocale();
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

  if (checklist.loading && !checklist.data) return <LoadingState message={t("org.paid_loading")} />;
  if (checklist.error || !checklist.data) {
    return (
      <ErrorPanel
        title={t("org.paid_error")}
        message={t("org.paid_permission", { p0: checklist.error ?? "" })}
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
          title={t("org.paid_activation")}
          subtitle={t("org.paid_activation_intro")}
          trailing={<StatusPill tone={activationTone(data.status)} label={statusLabel(data.status)} />}
        />
        {data.status === "active" ? <Intro>{t("org.paid_active_since")} {dateLabel(data.activated_at)}.</Intro> : null}
        {data.status === "suspended" ? (
          <FormMessage
            message={t("mobile.org.paid_sales_suspended", { p0: data.suspension_reason ? `: ${data.suspension_reason}` : "." })}
          />
        ) : null}
        <ListRow icon="₸" title={t("org.paid_type")} meta={t("org.paid_type_hint")} trailing={<StepDone done={data.paid_ticket_type} />} />
        <ListRow
          icon="P"
          title={t("org.payout_profile")}
          meta={t("org.payout_demo_hint")}
          trailing={
            data.payout_profile_verified ? <StepDone done /> : (
              <SubtleButton
                label={t("org.create_demo_profile")}
                disabled={Boolean(busy)}
                onPress={() => void run("payout", () => createPayoutProfile(event.organization_id), t("org.payout_profile_created"))}
              />
            )
          }
        />
        <ListRow
          icon="ID"
          title={t("org.identity_verification")}
          meta={t("org.identity_demo_hint")}
          trailing={
            data.identity_verified ? <StepDone done /> : (
              <SubtleButton
                label={t("org.verify_demo")}
                disabled={Boolean(busy)}
                onPress={() => void run("identity", () => createIdentityVerification(event.organization_id), t("org.identity_approved"))}
              />
            )
          }
        />
        <TermsStep
          terms={data.terms}
          busy={Boolean(busy)}
          onAccept={() => void run("terms", () => acceptPaidSalesTerms(event.id, data.terms.version), t("org.terms_accepted"))}
        />
        <ActivationFeeStep
          checklist={data}
          busy={Boolean(busy)}
          onStart={() => void run("fee", () => startActivation(event.id), t("org.activation_started"))}
          onChanged={checklist.reload}
        />
        <Intro style={{ marginTop: 12 }}>
          {t("org.activation_fee")} {priceLabel(data.activation_fee_minor)} {data.currency} {t("org.activation_fee_hint")}
        </Intro>
      </Panel>
    </>
  );
}
