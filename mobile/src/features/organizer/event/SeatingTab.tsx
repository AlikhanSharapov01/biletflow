import { useState } from "react";

import { listTicketTypes } from "@/api/catalog";
import { getLayout, listSeats } from "@/api/seating";
import type { EventView } from "@/api/types";
import { ErrorPanel, LoadingState, Panel, StatusPill } from "@/components/ui";
import { useRequest } from "@/hooks/useRequest";

import { Intro } from "../components/Intro";
import { SectionHeading } from "../components/SectionHeading";
import { countByStatus } from "../utils/seating";
import { SeatEditor } from "./seating/SeatEditor";
import { SeatGrid } from "./seating/SeatGrid";
import { SeatLegend } from "./seating/SeatLegend";
import { SeatMappingForm } from "./seating/SeatMappingForm";
import { t, useLocale } from "@/i18n";

// Assigned seating: map the predefined layout's price categories to ticket
// types once, then block, unblock or retarget individual seats.
export function SeatingTab({ event }: { event: EventView }) {
  useLocale();
  const [selectedId, setSelectedId] = useState("");
  const assigned = event.seating_mode === "assigned" && Boolean(event.venue_layout_id);

  const page = useRequest(async () => {
    if (!assigned || !event.venue_layout_id) return null;
    const [layout, seats, types] = await Promise.all([
      getLayout(event.venue_id, event.venue_layout_id),
      listSeats(event.id),
      listTicketTypes(event.id),
    ]);
    return { layout, seats: seats.items, types };
  }, [event.id, event.venue_id, event.venue_layout_id, assigned]);

  if (!assigned) {
    return (
      <Panel>
        <SectionHeading title={t("organizer.seating")} trailing={<StatusPill tone="neutral" label={t("checkout.general_admission")} />} />
        <Intro>
          {t("org.seating_general_hint")}
        </Intro>
      </Panel>
    );
  }
  if (page.loading && !page.data) return <LoadingState message={t("org.seating_loading")} />;
  if (page.error || !page.data) return <ErrorPanel title={t("checkout.seat_map_error")} message={page.error ?? ""} onRetry={page.reload} />;

  const { layout, seats, types } = page.data;
  const selected = seats.find((seat) => seat.id === selectedId) ?? null;

  if (seats.length === 0) {
    return <SeatMappingForm event={event} layout={layout} types={types} onConfigured={page.reload} />;
  }

  return (
    <>
      <Panel>
        <SectionHeading
          title={t("org.layout_version", { p0: layout.name, p1: layout.version })}
          subtitle={t("org.seating_edit_hint")}
          trailing={<StatusPill tone="neutral" label={t("count.seat.few", { count: seats.length })} />}
        />
        <SeatLegend counts={countByStatus(seats)} />
        <SeatGrid layout={layout} seats={seats} types={types} selectedId={selectedId} onSelect={setSelectedId} />
      </Panel>
      {selected ? (
        <SeatEditor
          key={`${selected.id}-${selected.is_blocked}-${selected.ticket_type_id}`}
          event={event}
          seat={selected}
          types={types}
          onSaved={page.reload}
          onClose={() => setSelectedId("")}
        />
      ) : null}
    </>
  );
}
