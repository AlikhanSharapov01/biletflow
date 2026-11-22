import { t, useLocale } from "../../../i18n";

export type CheckoutStep = "select" | "recipients" | "payment";

interface CheckoutStepsProps {
  step: CheckoutStep;
  // Assigned seating picks seats where general admission picks tickets.
  assigned: boolean;
  // Free baskets skip the payment step.
  paid: boolean;
}

// Where the buyer is inside the hold: tickets or seats, recipients, payment.
export function CheckoutSteps({ step, assigned, paid }: CheckoutStepsProps) {
  useLocale();
  const withPayment = paid || step === "payment";
  const steps: Array<{ id: CheckoutStep; label: string }> = [
    { id: "select", label: assigned ? t("checkout.step_seats") : t("checkout.step_tickets") },
    { id: "recipients", label: t("checkout.step_recipients") },
    ...(withPayment ? [{ id: "payment" as const, label: t("checkout.payment") }] : []),
  ];
  const currentIndex = steps.findIndex((item) => item.id === step);
  return (
    <ol className="checkout-steps" role="list" aria-label={t("checkout.steps_label")}>
      {steps.map((item, index) => {
        const done = index < currentIndex;
        return (
          <li key={item.id} className="checkout-step" data-done={done || undefined} aria-current={index === currentIndex ? "step" : undefined}>
            <span className="checkout-step-mark" aria-hidden="true">
              {done ? (
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>
              ) : index + 1}
            </span>
            <span className="checkout-step-label">{item.label}</span>
            {done ? <span className="visually-hidden">{t("checkout.step_completed")}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
