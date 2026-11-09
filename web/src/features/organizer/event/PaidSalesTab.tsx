import { t, translate, useLocale } from "../../../i18n";
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

  if (checklist.loading && !checklist.data) return <Loading label={t("org.paid_loading")} />;
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
  const done = (ok: boolean) => <StatusPill tone={ok ? "positive" : "pending"}>{ok ? t("org.done") : t("org.todo")}</StatusPill>;

  return (
    <div className="stack">
      <SimulatedNote />
      <Panel>
        <PanelHeading
          title={t("org.paid_activation")}
          subtitle={t("org.paid_activation_intro")}
          trailing={<StatusPill tone={activationTone(data.status)}>{statusLabel(data.status)}</StatusPill>}
        />
        {data.status === "active" ? <p className="form-intro">{t("org.paid_active_since")}{" "}{dateLabel(data.activated_at)}.</p> : null}
        {data.status === "suspended" ? (
          <p className="form-message" role="alert">{t("org.paid_suspended")}{data.suspension_reason ? `: ${data.suspension_reason}` : "."}{" "}{t("org.contact_reinstate")}</p>
        ) : null}
        <div className="list checklist">
          <ListRow
            icon="₸"
            title={t("org.paid_type")}
            meta={t("org.paid_type_hint")}
            actions={done(data.paid_ticket_type)}
          />
          <ListRow
            icon="P"
            title={t("org.payout_profile")}
            meta={t("org.payout_demo_hint")}
            actions={
              data.payout_profile_verified ? done(true) : (
                <Button size="sm" disabled={Boolean(busy)} onClick={() => void run("payout", () => createPayoutProfile(event.organization_id), t("org.payout_profile_created"))}>{t("org.create_demo_profile")}</Button>
              )
            }
          />
          <ListRow
            icon="ID"
            title={t("org.identity_verification")}
            meta={t("org.identity_demo_hint")}
            actions={
              data.identity_verified ? done(true) : (
                <Button size="sm" disabled={Boolean(busy)} onClick={() => void run("identity", () => createIdentityVerification(event.organization_id), t("org.identity_approved"))}>{t("org.verify_demo")}</Button>
              )
            }
          />
          <ListRow
            icon="T"
            title={t("org.terms_version", { p0: data.terms.version })}
            meta={t("org.terms_hint")}
            actions={
              data.terms.accepted ? done(true) : (
                <Button size="sm" disabled={Boolean(busy)} onClick={() => void run("terms", () => acceptPaidSalesTerms(event.id, data.terms.version), t("org.terms_accepted"))}>{t("org.accept_terms")}</Button>
              )
            }
          >
            <details className="terms-text">
              <summary>{t("org.read_terms")}</summary>
              <p>{translate(data.terms.text)}</p>
            </details>
          </ListRow>
          <ActivationFeeStep
            checklist={data}
            busy={Boolean(busy)}
            onStart={() => void run("fee", () => startActivation(event.id), t("org.activation_started"))}
            onChanged={checklist.reload}
          />
        </div>
        <p className="form-intro">{t("org.activation_fee")}{" "}{priceLabel(data.activation_fee_minor)} {data.currency}{" "}{t("org.activation_fee_hint")}</p>
      </Panel>
    </div>
  );
}
