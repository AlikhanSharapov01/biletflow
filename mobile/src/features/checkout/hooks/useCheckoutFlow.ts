import { useCallback, useEffect, useState } from "react";

import { confirmHold, createHold, releaseHold, startCheckout } from "@/api/checkout";
import { describeError, errorCodeOf } from "@/api/errors";
import type { EventView, Hold, HoldLine, Order, Profile, TicketType } from "@/api/types";
import type { PromoPreview } from "@/api/types/promo";
import { useToast } from "@/context/ToastContext";
import { useCountdown } from "@/hooks/useCountdown";
import { basketIsPaid, initialRecipients, recipientsComplete, recipientsPayload, type RecipientValues } from "../utils/checkout";

// Hold -> recipients -> (paid: simulated payment) -> confirmed order.
export function useCheckoutFlow(event: EventView, tickets: TicketType[], profile: Profile | null, promo: PromoPreview | null) {
  const { notify } = useToast();
  const [hold, setHold] = useState<Hold | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [completed, setCompleted] = useState<Order | null>(null);
  const [recipients, setRecipients] = useState<RecipientValues>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const secondsLeft = useCountdown(hold?.expires_at ?? null);
  const paid = hold ? basketIsPaid(hold.allocations, tickets) : false;

  const reset = useCallback((note = "") => {
    setHold(null);
    setOrder(null);
    setCompleted(null);
    setMessage(note);
  }, []);

  useEffect(() => {
    if (hold && !completed && secondsLeft === 0) reset("Your reservation expired. Choose your tickets again.");
  }, [hold, completed, secondsLeft, reset]);

  const reserve = async (lines: HoldLine[]) => {
    if (!profile) return;
    if (lines.length === 0) {
      setMessage("Choose at least one ticket.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await createHold(event.id, lines, promo?.code);
      setHold(created);
      setRecipients(initialRecipients(created.allocations, { name: profile.display_name, email: profile.email }));
    } catch (failure) {
      setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    if (hold) await releaseHold(hold.id).catch(() => undefined);
    reset();
  };

  const finished = useCallback(
    (confirmed: Order) => {
      notify(confirmed.payment ? "Payment received. Your tickets are ready." : "Registration confirmed. Your tickets are ready.");
      setCompleted(confirmed);
      setHold(null);
      setOrder(null);
    },
    [notify],
  );

  const confirm = async () => {
    if (!hold) return;
    if (!recipientsComplete(hold.allocations, recipients)) {
      setMessage("Enter a name and a valid email for every ticket.");
      return;
    }
    setBusy(true);
    setMessage("");
    const payload = recipientsPayload(hold.allocations, recipients);
    try {
      const result = paid ? await startCheckout(hold.id, payload) : await confirmHold(hold.id, payload);
      if (result.status === "confirmed") finished(result);
      else setOrder(result);
    } catch (failure) {
      // A promo that changed since the preview needs a fresh hold and quote.
      if (errorCodeOf(failure) === "promo_requote_required") reset(describeError(failure));
      else setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return { hold, order, completed, recipients, setRecipients, busy, message, secondsLeft, paid, reserve, release, confirm, finished, reset };
}
