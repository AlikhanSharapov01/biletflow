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

interface DetailsTabProps {
  event: EventView;
  categories: Category[];
  venues: Venue[];
  onSaved: () => void;
}

export function DetailsTab({ event, categories, venues, onSaved }: DetailsTabProps) {
  const { notify } = useToast();
  const [state, setState] = useState<FormState>(IDLE);

  const save = async (input: EventInput) => {
    setState({ busy: true, message: "", success: false });
    try {
      await updateEvent(event.id, input);
      notify("Event saved.");
      setState({ busy: false, message: "Saved.", success: true });
      onSaved();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure), success: false });
    }
  };

  return (
    <>
      <Panel>
        <SectionHeading
          title="Event details"
          subtitle="Saving replaces the whole configuration. Published events must stay publishable."
          trailing={<StatusPill tone="neutral" label={event.seating_mode === "assigned" ? "Assigned seating" : "General admission"} />}
        />
        <EventForm
          initial={event}
          categories={categories}
          venues={venues}
          submitLabel="Save changes"
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
