import { useState } from "react";
import { useNavigate } from "react-router";
import { createEvent, createTicketType } from "../../../api/eventAdmin";
import { describeError } from "../../../api/errors";
import type { Category, EventInput, Organization, Venue } from "../../../api/types";
import { Panel, PanelHeading, useToast } from "../../../components/ui";
import { EventForm } from "../components/EventForm";
import { IDLE, type FormState } from "../utils/formState";

interface CreateEventPanelProps {
  organization: Organization;
  categories: Category[];
  venues: Venue[];
}

export function CreateEventPanel({ organization, categories, venues }: CreateEventPanelProps) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState<FormState>(IDLE);

  const submit = async (input: EventInput) => {
    setState({ ...IDLE, busy: true });
    try {
      const created = await createEvent(organization.id, input);
      try {
        await createTicketType(created.id, {
          name: "General admission",
          description: "",
          kind: "free",
          price_minor: 0,
          quantity_limit: input.capacity,
          per_order_limit: Math.min(5, Math.max(1, input.capacity)),
          sales_open_at: input.registration_opens_at,
          sales_close_at: input.registration_closes_at,
          is_hidden: false,
        });
        notify("Event draft created with a free RSVP ticket.");
      } catch (failure) {
        notify(`The event draft was saved, but its RSVP ticket could not be created: ${describeError(failure)}`);
      }
      setState(IDLE);
      navigate(`/organizer/events/${encodeURIComponent(created.id)}`);
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  return (
    <Panel>
      <PanelHeading title="Create an event draft" />
      <p className="form-intro">A free RSVP ticket is added automatically so a valid event can be published. You can add more ticket types on the event page.</p>
      <EventForm
        categories={categories}
        venues={venues}
        submitLabel="Create event draft"
        busy={state.busy}
        message={state.message}
        onSubmit={submit}
        onInvalid={(error) => setState({ message: error, success: false, busy: false })}
      />
    </Panel>
  );
}
