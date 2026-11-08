import { useState } from "react";
import { Text } from "react-native";

import type { EventView, TicketType } from "@/api/types";
import type { PromoPreview } from "@/api/types/promo";
import { EmptyState } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { checkoutStyles } from "./components/checkoutStyles";
import { OrderConfirmed } from "./components/OrderConfirmed";
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
  // `promo` route param (from a campaign link), if any.
  promoFromRoute?: string | null;
}

// Pick tickets (or seats), hold them for ten minutes, name a recipient per
// place, then confirm (free) or pay through the simulator (paid). The app is
// only reachable signed in, so there is no sign-in prompt here.
export function CheckoutPanel({ event, tickets, promoFromRoute = null }: CheckoutPanelProps) {
  const { profile } = useAuth();
  const [quantities, setQuantities] = useState<Quantities>({});
  const [promoCode] = useState(() => initialPromo(event.id, promoFromRoute));
  const [promo, setPromo] = useState<PromoPreview | null>(null);
  const flow = useCheckoutFlow(event, tickets, profile, promo);

  if (!profile) return null;
  if (event.publication_state !== "published") {
    return <EmptyState message="Registration opens when the event is published." />;
  }
  if (event.time_status === "completed") {
    return <EmptyState message="This event has ended." />;
  }
  if (!profile.email_verified_at) {
    return <Text style={checkoutStyles.intro}>Verify your email address before reserving tickets. Check your inbox for the verification link.</Text>;
  }
  if (tickets.length === 0) {
    return <EmptyState message="Ticket details are not available yet." />;
  }

  const typeName = (typeId: string) => tickets.find((type) => type.id === typeId)?.name ?? "Ticket";

  if (flow.completed) {
    return (
      <OrderConfirmed
        order={flow.completed}
        onAgain={() => {
          setQuantities({});
          flow.reset();
        }}
      />
    );
  }

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
