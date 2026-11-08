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

// Assigned seating: map the predefined layout's price categories to ticket
// types once, then block, unblock or retarget individual seats.
export function SeatingTab({ event }: { event: EventView }) {
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
        <SectionHeading title="Seating" trailing={<StatusPill tone="neutral" label="General admission" />} />
        <Intro>
          This event uses general admission. To sell assigned seats, open the Details tab, set Seating to “Assigned seats” and choose one of the venue’s
          predefined layouts. Layouts cannot change once tickets have been reserved.
        </Intro>
      </Panel>
    );
  }
  if (page.loading && !page.data) return <LoadingState message="Loading seat map…" />;
  if (page.error || !page.data) return <ErrorPanel title="We couldn’t load the seat map." message={page.error ?? ""} onRetry={page.reload} />;

  const { layout, seats, types } = page.data;
  const selected = seats.find((seat) => seat.id === selectedId) ?? null;

  if (seats.length === 0) {
    return <SeatMappingForm event={event} layout={layout} types={types} onConfigured={page.reload} />;
  }

  return (
    <>
      <Panel>
        <SectionHeading
          title={`${layout.name} · version ${layout.version}`}
          subtitle="Select a seat to block it or move it to another ticket type. Sold and held seats cannot change."
          trailing={<StatusPill tone="neutral" label={`${seats.length} seats`} />}
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
