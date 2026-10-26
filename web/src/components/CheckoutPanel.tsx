import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { confirmHold, createHold, releaseHold } from "../api/checkout";
import { describeError } from "../api/errors";
import type { EventView, Hold, TicketType } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useCountdown } from "../hooks/useCountdown";
import {
  holdLines,
  initialRecipients,
  recipientsComplete,
  recipientsPayload,
  ticketAvailability,
  totalQuantity,
  type Quantities,
  type RecipientValues,
} from "../utils/checkout";
import { formatCountdown, priceLabel } from "../utils/format";
import { EmptyState, FormMessage } from "./Feedback";
import { useToast } from "./Toast";

interface CheckoutPanelProps {
  event: EventView;
  tickets: TicketType[];
}

// Free registration: pick quantities, hold them for ten minutes, name a
// recipient per place, confirm. Paid types are shown but cannot be reserved
// until the backend's paid checkout exists.
export function CheckoutPanel({ event, tickets }: CheckoutPanelProps) {
  const { status, profile } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [quantities, setQuantities] = useState<Quantities>({});
  const [hold, setHold] = useState<Hold | null>(null);
  const [recipients, setRecipients] = useState<RecipientValues>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const secondsLeft = useCountdown(hold?.expires_at ?? null);

  useEffect(() => {
    if (hold && secondsLeft === 0) {
      setHold(null);
      setMessage("Your reservation expired. Choose your tickets again.");
    }
  }, [hold, secondsLeft]);

  const eventPath = `/events/${encodeURIComponent(event.id)}`;

  if (status === "anonymous") {
    return (
      <p className="signin-prompt">
        <Link to="/sign-in" state={{ from: eventPath }}>
          Sign in
        </Link>{" "}
        to reserve a free ticket for this event.
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
  if (event.seating_mode === "assigned") {
    return <EmptyState>This event uses assigned seating. Seat selection is not available in the browser yet.</EmptyState>;
  }
  if (tickets.length === 0) {
    return <EmptyState>Ticket details are not available yet.</EmptyState>;
  }

  const typeName = (typeId: string) => tickets.find((type) => type.id === typeId)?.name ?? "Ticket";

  const reserve = async () => {
    const lines = holdLines(quantities);
    if (lines.length === 0) {
      setMessage("Choose at least one ticket.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await createHold(event.id, lines);
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
    setHold(null);
    setMessage("");
  };

  const confirm = async () => {
    if (!hold) return;
    if (!recipientsComplete(hold.allocations, recipients)) {
      setMessage("Enter a name and a valid email for every ticket.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const order = await confirmHold(hold.id, recipientsPayload(hold.allocations, recipients));
      notify("Registration confirmed. Your tickets are ready.");
      navigate(`/orders/${encodeURIComponent(order.id)}`);
    } catch (failure) {
      setMessage(describeError(failure));
      setBusy(false);
    }
  };

  if (hold) {
    return (
      <div className="checkout">
        <div className="checkout-head">
          <h3>Who is coming?</h3>
          <span className={`countdown ${secondsLeft < 60 ? "urgent" : ""}`} role="timer" aria-live="polite">
            Held for {formatCountdown(secondsLeft)}
          </span>
        </div>
        <p className="form-intro">Each ticket is sent to its recipient by email. Recipients claim it by signing in with that email.</p>
        <div className="recipient-list">
          {hold.allocations.map((allocation, index) => {
            const value = recipients[allocation.id] ?? { name: "", email: "" };
            return (
              <fieldset className="recipient" key={allocation.id}>
                <legend>
                  Ticket {index + 1} · {typeName(allocation.ticket_type_id)}
                </legend>
                <div className="form-grid">
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={value.name}
                      maxLength={200}
                      required
                      onChange={(e) => setRecipients((current) => ({ ...current, [allocation.id]: { ...value, name: e.target.value } }))}
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={value.email}
                      maxLength={254}
                      required
                      onChange={(e) => setRecipients((current) => ({ ...current, [allocation.id]: { ...value, email: e.target.value } }))}
                    />
                  </label>
                </div>
              </fieldset>
            );
          })}
        </div>
        <FormMessage message={message} />
        <div className="form-actions">
          <button className="primary-button" type="button" disabled={busy} onClick={() => void confirm()}>
            {busy ? "Confirming…" : "Confirm registration"}
          </button>
          <button className="subtle-button" type="button" disabled={busy} onClick={() => void release()}>
            Choose again
          </button>
        </div>
      </div>
    );
  }

  const selected = totalQuantity(quantities);

  return (
    <div className="checkout">
      <div className="ticket-options">
        {tickets.map((type) => {
          const availability = ticketAvailability(type, event);
          const quantity = quantities[type.id] ?? 0;
          return (
            <div className="ticket-option" key={type.id}>
              <div className="ticket-option-copy">
                <strong>{type.name}</strong>
                {type.description ? <small>{type.description}</small> : null}
                {availability.reason ? <small className="ticket-reason">{availability.reason}</small> : null}
              </div>
              <span className="price">{priceLabel(type.price_minor)}</span>
              {availability.purchasable ? (
                <label className="qty-field">
                  <span className="visually-hidden">Quantity for {type.name}</span>
                  <select value={quantity} onChange={(e) => setQuantities((current) => ({ ...current, [type.id]: Number(e.target.value) }))}>
                    {Array.from({ length: availability.maxQuantity + 1 }, (_, count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="status neutral">Unavailable</span>
              )}
            </div>
          );
        })}
      </div>
      <FormMessage message={message} />
      <div className="form-actions checkout-actions">
        <button className="primary-button" type="button" disabled={busy || selected === 0} onClick={() => void reserve()}>
          {busy ? "Reserving…" : selected > 0 ? `Reserve ${selected} ticket${selected === 1 ? "" : "s"}` : "Reserve tickets"}
        </button>
        <small className="form-intro">Tickets are held for 10 minutes while you add recipients.</small>
      </div>
    </div>
  );
}
