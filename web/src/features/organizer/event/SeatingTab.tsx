import { useState } from "react";
import { listTicketTypes } from "../../../api/catalog";
import { getLayout, listSeats } from "../../../api/seating";
import type { EventView } from "../../../api/types";
import { ErrorPanel, Loading, Panel, PanelHeading, StatusPill } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { countByStatus } from "../utils/seating";
import { SeatEditor } from "./seating/SeatEditor";
import { SeatGrid } from "./seating/SeatGrid";
import { SeatMappingForm } from "./seating/SeatMappingForm";

// Assigned seating: map the predefined layout's price categories to ticket
// types once, then block, unblock or retarget individual seats.
export function SeatingTab({ event }: { event: EventView }) {
  const [selectedId, setSelectedId] = useState("");
  const assigned = event.seating_mode === "assigned" && Boolean(event.venue_layout_id);

  const page = useRequest(
    async () => {
      if (!assigned || !event.venue_layout_id) return null;
      const [layout, seats, types] = await Promise.all([
        getLayout(event.venue_id, event.venue_layout_id),
        listSeats(event.id),
        listTicketTypes(event.id),
      ]);
      return { layout, seats: seats.items, types };
    },
    [event.id, event.venue_id, event.venue_layout_id, assigned],
  );

  if (!assigned) {
    return (
      <Panel>
        <PanelHeading title="Seating" trailing={<StatusPill tone="neutral">General admission</StatusPill>} />
        <p className="form-intro">
          This event uses general admission. To sell assigned seats, open the Details tab, set Seating to “Assigned seats” and choose one of the venue’s predefined
          layouts. Layouts cannot change once tickets have been reserved.
        </p>
      </Panel>
    );
  }
  if (page.loading && !page.data) return <Loading label="Loading seat map…" />;
  if (page.error || !page.data) return <ErrorPanel title="We couldn’t load the seat map." message={page.error ?? ""} onRetry={page.reload} />;

  const { layout, seats, types } = page.data;
  const counts = countByStatus(seats);
  const selected = seats.find((seat) => seat.id === selectedId) ?? null;

  if (seats.length === 0) {
    return <SeatMappingForm event={event} layout={layout} types={types} onConfigured={page.reload} />;
  }

  return (
    <div className="stack">
      <Panel>
        <PanelHeading
          title={`${layout.name} · version ${layout.version}`}
          subtitle="Select a seat to block it or move it to another ticket type. Sold and held seats cannot change."
          trailing={<StatusPill tone="neutral">{seats.length} seats</StatusPill>}
        />
        <ul className="seat-summary" aria-label="Seat counts">
          <li><span className="seat-dot available" aria-hidden="true" />{counts.available} available</li>
          <li><span className="seat-dot unavailable" aria-hidden="true" />{counts.unavailable} not on sale</li>
          <li><span className="seat-dot blocked" aria-hidden="true" />{counts.blocked} blocked</li>
          <li><span className="seat-dot sold" aria-hidden="true" />{counts.sold + counts.held + counts.refund_pending} held or sold</li>
        </ul>
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
    </div>
  );
}
