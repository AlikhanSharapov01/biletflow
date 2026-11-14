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
import { t, useLocale } from "@/i18n";

// Create an event draft in a workspace (web CreateEventPanel). A free RSVP
// ticket type is added right after, as on the web.
export function NewEventScreen() {
  useLocale();
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
      router.replace({ pathname: "/organizer/events/[eventId]", params: { eventId: created.id } });
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  return (
    <ScrollScreen backLabel={t("nav.workspace")}>
      <PageHeading eyebrow={t("nav.workspace")} title={t("mobile.org.new_event")} subtitle={t("mobile.org.new_event_intro")} />
      {!organizationId ? <EmptyState message={t("mobile.org.open_from_workspace")} /> : null}
      {organizationId && lists.loading ? <LoadingState message={t("mobile.org.loading_form")} /> : null}
      {organizationId && lists.error ? <ErrorPanel title={t("mobile.org.form_error")} message={lists.error} onRetry={lists.reload} /> : null}
      {organizationId && lists.data ? (
        <Panel>
          <SectionHeading
            title={t("org.create_event_heading")}
            subtitle={t("org.free_rsvp_hint")}
          />
          <EventForm
            categories={lists.data.categories}
            venues={lists.data.venues}
            submitLabel={t("org.create_event")}
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
