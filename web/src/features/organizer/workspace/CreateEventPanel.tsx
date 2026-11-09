import { t, useLocale } from "../../../i18n";
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
  useLocale();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState<FormState>(IDLE);

  const submit = async (input: EventInput) => {
    setState({ ...IDLE, busy: true });
    try {
      const created = await createEvent(organization.id, input);
      try {
        await createTicketType(created.id, {
          name: t("checkout.general_admission"),
          description: "",
          kind: "free",
          price_minor: 0,
          quantity_limit: input.capacity,
          per_order_limit: Math.min(5, Math.max(1, input.capacity)),
          sales_open_at: input.registration_opens_at,
          sales_close_at: input.registration_closes_at,
          is_hidden: false,
        });
        notify(t("org.draft_created"));
      } catch (failure) {
        notify(t("org.draft_ticket_error", { p0: describeError(failure) }));
      }
      setState(IDLE);
      navigate(`/organizer/events/${encodeURIComponent(created.id)}`);
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  return (
    <Panel>
      <PanelHeading title={t("org.create_event_heading")} />
      <p className="form-intro">{t("org.free_rsvp_hint")}</p>
      <EventForm
        categories={categories}
        venues={venues}
        submitLabel={t("org.create_event")}
        busy={state.busy}
        message={state.message}
        onSubmit={submit}
        onInvalid={(error) => setState({ message: error, success: false, busy: false })}
      />
    </Panel>
  );
}
