import { useState } from "react";

import { updateEvent } from "@/api/eventAdmin";
import { describeError } from "@/api/errors";
import type { Category, EventInput, EventView, Venue } from "@/api/types";
import { Panel, StatusPill } from "@/components/ui";
import { useToast } from "@/context/ToastContext";

import { EventForm } from "../components/EventForm";
import { SectionHeading } from "../components/SectionHeading";
import { IDLE, type FormState } from "../utils/formState";
import { EventImagePanel } from "./details/EventImagePanel";
import { t, useLocale } from "@/i18n";

interface DetailsTabProps {
  event: EventView;
  categories: Category[];
  venues: Venue[];
  onSaved: () => void;
}

export function DetailsTab({ event, categories, venues, onSaved }: DetailsTabProps) {
  useLocale();
  const { notify } = useToast();
  const [state, setState] = useState<FormState>(IDLE);

  const save = async (input: EventInput) => {
    setState({ busy: true, message: "", success: false });
    try {
      await updateEvent(event.id, input);
      notify(t("org.event_saved"));
      setState({ busy: false, message: t("common.saved"), success: true });
      onSaved();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure), success: false });
    }
  };

  return (
    <>
      <Panel>
        <SectionHeading
          title={t("org.event_details")}
          subtitle={t("org.save_configuration_hint")}
          trailing={<StatusPill tone="neutral" label={event.seating_mode === "assigned" ? t("event.assigned_seating") : t("checkout.general_admission")} />}
        />
        <EventForm
          initial={event}
          categories={categories}
          venues={venues}
          submitLabel={t("org.save_changes")}
          busy={state.busy}
          message={state.message}
          success={state.success}
          onSubmit={save}
          onInvalid={(error) => setState({ busy: false, message: error, success: false })}
        />
      </Panel>
      <EventImagePanel event={event} />
    </>
  );
}
