import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { listCategories, listVenues } from "@/api/catalog";
import { createEvent, createTicketType } from "@/api/eventAdmin";
import { describeError } from "@/api/errors";
import type { EventInput } from "@/api/types";
import { ScrollScreen } from "@/components/layout";
import { EmptyState, ErrorPanel, LoadingState, PageHeading, Panel } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { useRequest } from "@/hooks/useRequest";

import { EventForm } from "../components/EventForm";
import { SectionHeading } from "../components/SectionHeading";
import { IDLE, type FormState } from "../utils/formState";

// Create an event draft in a workspace (web CreateEventPanel). A free RSVP
// ticket type is added right after, as on the web.
export function NewEventScreen() {
  const { organizationId } = useLocalSearchParams<{ organizationId?: string }>();
  const router = useRouter();
  const { notify } = useToast();
  const [state, setState] = useState<FormState>(IDLE);
  const lists = useRequest(async () => {
    const [categories, venues] = await Promise.all([listCategories(), listVenues()]);
    return { categories, venues };
  }, []);

  const submit = async (input: EventInput) => {
    if (!organizationId) return;
    setState({ ...IDLE, busy: true });
    try {
      const created = await createEvent(organizationId, input);
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
      router.replace({ pathname: "/organizer/events/[eventId]", params: { eventId: created.id } });
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  return (
    <ScrollScreen backLabel="Organizer workspace">
      <PageHeading eyebrow="Organizer workspace" title="New event" subtitle="Prepare a draft, then publish it from the event page." />
      {!organizationId ? <EmptyState message="Open this screen from your organizer workspace." /> : null}
      {organizationId && lists.loading ? <LoadingState message="Loading categories and venues…" /> : null}
      {organizationId && lists.error ? <ErrorPanel title="We couldn’t load categories and venues." message={lists.error} onRetry={lists.reload} /> : null}
      {organizationId && lists.data ? (
        <Panel>
          <SectionHeading
            title="Create an event draft"
            subtitle="A free RSVP ticket is added automatically so a valid event can be published. You can add more ticket types on the event page."
          />
          <EventForm
            categories={lists.data.categories}
            venues={lists.data.venues}
            submitLabel="Create event draft"
            busy={state.busy}
            message={state.message}
            onSubmit={submit}
            onInvalid={(error) => setState({ message: error, success: false, busy: false })}
          />
        </Panel>
      ) : null}
    </ScrollScreen>
  );
}
