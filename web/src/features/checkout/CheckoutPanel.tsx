import { useState } from "react";
import { Link } from "react-router";
import type { EventView, TicketType } from "../../api/types";
import type { PromoPreview } from "../../api/types/promo";
import { EmptyState } from "../../components/ui/Feedback";
import { useAuth } from "../auth/AuthContext";
import { PaymentStep } from "./components/PaymentStep";
import { PromoCodeField } from "./components/PromoCodeField";
import { RecipientForm } from "./components/RecipientForm";
import { SeatPicker } from "./components/SeatPicker";
import { TicketSelector } from "./components/TicketSelector";
import { useCheckoutFlow } from "./hooks/useCheckoutFlow";
import { holdLines, holdSubtotal, type Quantities } from "./utils/checkout";
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
  const { status, profile } = useAuth();
  const [quantities, setQuantities] = useState<Quantities>({});
  const [promoCode] = useState(() => initialPromo(event.id, promoFromUrl));
  const [promo, setPromo] = useState<PromoPreview | null>(null);
  const flow = useCheckoutFlow(event, tickets, profile, promo);

  const eventPath = `/events/${encodeURIComponent(event.id)}`;

  if (status === "anonymous") {
    const from = promoCode ? `${eventPath}?promo=${encodeURIComponent(promoCode)}` : eventPath;
    return (
      <p className="signin-prompt">
        <Link to="/sign-in" state={{ from }}>
          Sign in
        </Link>{" "}
        to reserve tickets for this event.
      </p>
    );
  }
  if (!profile) return null;
  if (event.publication_state !== "published") {
    return <EmptyState>Registration opens when the event is published.</EmptyState>;
  }
  if (event.time_status === "completed") {
    return <EmptyState>This event has ended.</EmptyState>;
  }
  if (!profile.email_verified_at) {
    return <p className="signin-prompt">Verify your email address before reserving tickets. Check your inbox for the verification link.</p>;
  }
  if (tickets.length === 0) {
    return <EmptyState>Ticket details are not available yet.</EmptyState>;
  }

  const typeName = (typeId: string) => tickets.find((type) => type.id === typeId)?.name ?? "Ticket";

  if (flow.order && flow.hold) {
    return <PaymentStep order={flow.order} onConfirmed={flow.finished} onClosed={() => flow.reset()} onCancel={() => void flow.release()} />;
  }

  if (flow.hold) {
    return (
      <RecipientForm
        hold={flow.hold}
        typeName={typeName}
        recipients={flow.recipients}
        setRecipients={flow.setRecipients}
        secondsLeft={flow.secondsLeft}
        busy={flow.busy}
        message={flow.message}
        paid={flow.paid}
        subtotalMinor={holdSubtotal(flow.hold.allocations, tickets)}
        onConfirm={() => void flow.confirm()}
        onRelease={() => void flow.release()}
      />
    );
  }

  const promoSlot = <PromoCodeField eventId={event.id} initialCode={promoCode} applied={promo} onApplied={setPromo} />;

  if (event.seating_mode === "assigned") {
    return (
      <SeatPicker event={event} tickets={tickets} busy={flow.busy} message={flow.message} promoSlot={promoSlot} onReserve={(lines) => void flow.reserve(lines)} />
    );
  }

  return (
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
  );
}
