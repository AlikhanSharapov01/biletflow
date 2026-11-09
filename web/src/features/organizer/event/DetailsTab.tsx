import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { updateEvent } from "../../../api/eventAdmin";
import { describeError } from "../../../api/errors";
import type { Category, EventInput, EventView, Venue } from "../../../api/types";
import { Panel, PanelHeading, StatusPill, useToast } from "../../../components/ui";
import { EventForm } from "../components/EventForm";
import { IDLE, type FormState } from "../utils/formState";
import { EventImagePanel } from "./details/EventImagePanel";

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
    <div className="stack">
      <Panel>
        <PanelHeading
          title={t("org.event_details")}
          trailing={<StatusPill tone="neutral">{event.seating_mode === "assigned" ? t("event.assigned_seating") : t("checkout.general_admission")}</StatusPill>}
        />
        <p className="form-intro">{t("org.save_configuration_hint")}</p>
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
    </div>
  );
}
