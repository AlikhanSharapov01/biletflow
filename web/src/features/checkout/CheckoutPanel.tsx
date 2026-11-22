import { t, useLocale } from "../../i18n";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { EventView, TicketType } from "../../api/types";
import type { PromoPreview } from "../../api/types/promo";
import { EmptyState } from "../../components/ui/Feedback";
import { useAuth } from "../auth/AuthContext";
import { CheckoutSteps, checkoutStepList, type CheckoutStep } from "./components/CheckoutSteps";
import { HoldCountdown, holdAnnouncement } from "./components/HoldCountdown";
import { PaymentStep } from "./components/PaymentStep";
import { PromoCodeField } from "./components/PromoCodeField";
import { RecipientForm } from "./components/RecipientForm";
import { SeatPicker } from "./components/SeatPicker";
import { TicketSelector } from "./components/TicketSelector";
import { VerifyEmailPrompt } from "./components/VerifyEmailPrompt";
import { useCheckoutFlow } from "./hooks/useCheckoutFlow";
import { holdLines, holdSubtotal, isPaidType, ticketAvailability, type Quantities } from "./utils/checkout";
import { initialPromo } from "./utils/promo";

interface CheckoutPanelProps {
  event: EventView;
  tickets: TicketType[];
  // `?promo=` from the event page URL, if any.
  promoFromUrl?: string | null;
}

// Pick tickets (or seats), hold them for ten minutes, name a recipient per
// place, then confirm (free) or pay through the simulator (paid).
export function CheckoutPanel({ event, tickets, promoFromUrl = null }: CheckoutPanelProps) {
  useLocale();
  const { status, profile } = useAuth();
  const [quantities, setQuantities] = useState<Quantities>({});
  const [promoCode] = useState(() => initialPromo(event.id, promoFromUrl));
  const [promo, setPromo] = useState<PromoPreview | null>(null);
  const flow = useCheckoutFlow(event, tickets, profile, promo);

  // Each step replaces the last, so its heading takes focus (the previous step's
  // controls are gone) and the status region says where the buyer is now.
  const currentStep: CheckoutStep = flow.order && flow.hold ? "payment" : flow.hold ? "recipients" : "select";
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(currentStep);
  const [stepChanged, setStepChanged] = useState(false);
  useEffect(() => {
    if (shownStep.current === currentStep) return;
    shownStep.current = currentStep;
    setStepChanged(true);
    stepHeading.current?.focus();
  }, [currentStep]);

  const eventPath = `/events/${encodeURIComponent(event.id)}`;

  if (status === "anonymous") {
    const from = promoCode ? `${eventPath}?promo=${encodeURIComponent(promoCode)}` : eventPath;
    return (
      <p className="signin-prompt">
        <Link to="/sign-in" state={{ from }}>{t("auth.sign_in")}</Link>{" "}{t("checkout.sign_in_hint")}{" "}</p>
    );
  }
  if (!profile) return null;
  if (event.publication_state !== "published") {
    return <EmptyState>{t("checkout.registration_unpublished_sentence")}</EmptyState>;
  }
  if (event.time_status === "completed") {
    return <EmptyState>{t("checkout.event_ended")}</EmptyState>;
  }
  if (!profile.email_verified_at) {
    return <VerifyEmailPrompt email={profile.email} />;
  }
  if (tickets.length === 0) {
    return <EmptyState>{t("checkout.details_unavailable")}</EmptyState>;
  }

  const typeName = (typeId: string) => tickets.find((type) => type.id === typeId)?.name ?? t("common.ticket");

  // Before a hold only the buyer's choice tells whether payment follows: the selected
  // tickets for general admission, any purchasable paid type otherwise.
  const selectedPaid = tickets.some((type) => (quantities[type.id] ?? 0) > 0 && isPaidType(type));
  const anySelected = Object.values(quantities).some((quantity) => quantity > 0);
  const offersPaid = tickets.some((type) => isPaidType(type) && ticketAvailability(type, event).purchasable);
  const paidBeforeHold = event.seating_mode === "assigned" || !anySelected ? offersPaid : selectedPaid;

  // The indicator sits above every step; once tickets are held the countdown
  // shares its row.
  const progress = (step: CheckoutStep) => {
    const assigned = event.seating_mode === "assigned";
    const paid = flow.hold ? flow.paid : paidBeforeHold;
    const steps = checkoutStepList(step, assigned, paid);
    const index = steps.findIndex((item) => item.id === step);
    const label = steps[index]?.label ?? "";
    const hold = flow.hold ? holdAnnouncement(flow.secondsLeft) : flow.expired ? holdAnnouncement(0) : "";
    // A running-low or expiry warning outranks the step announcement.
    const status = hold || (stepChanged ? t("checkout.step.announce", { current: index + 1, total: steps.length, label }) : "");
    return (
      <div className="checkout-progress">
        <CheckoutSteps step={step} assigned={assigned} paid={paid} />
        {flow.hold ? <HoldCountdown secondsLeft={flow.secondsLeft} /> : null}
        <h3 className="visually-hidden" tabIndex={-1} ref={stepHeading}>{label}</h3>
        <span className="visually-hidden" role="status">{status}</span>
      </div>
    );
  };

  if (flow.order && flow.hold) {
    return (
      <>
        {progress("payment")}
        <PaymentStep order={flow.order} onConfirmed={flow.finished} onClosed={() => flow.reset()} onCancel={() => void flow.release()} showQuoteTimer={false} />
      </>
    );
  }

  if (flow.hold) {
    return (
      <>
        {progress("recipients")}
        <RecipientForm
          hold={flow.hold}
          typeName={typeName}
          recipients={flow.recipients}
          setRecipients={flow.setRecipients}
          busy={flow.busy}
          message={flow.message}
          paid={flow.paid}
          subtotalMinor={holdSubtotal(flow.hold.allocations, tickets)}
          onConfirm={() => void flow.confirm()}
          onRelease={() => void flow.release()}
        />
      </>
    );
  }

  const promoSlot = <PromoCodeField eventId={event.id} initialCode={promoCode} applied={promo} onApplied={setPromo} />;

  if (event.seating_mode === "assigned") {
    return (
      <>
        {progress("select")}
        <SeatPicker event={event} tickets={tickets} busy={flow.busy} message={flow.message} promoSlot={promoSlot} onReserve={(lines) => void flow.reserve(lines)} />
      </>
    );
  }

  return (
    <>
      {progress("select")}
      <TicketSelector
        event={event}
        tickets={tickets}
        quantities={quantities}
        setQuantities={setQuantities}
        busy={flow.busy}
        message={flow.message}
        promo={promo}
        promoSlot={promoSlot}
        onReserve={() => void flow.reserve(holdLines(quantities))}
      />
    </>
  );
}
