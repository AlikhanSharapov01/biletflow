import { t, useLocale } from "../../../i18n";
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
  useLocale();
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
        <PanelHeading title={t("organizer.seating")} trailing={<StatusPill tone="neutral">{t("checkout.general_admission")}</StatusPill>} />
        <p className="form-intro">{t("org.seating_general_hint")}</p>
      </Panel>
    );
  }
  if (page.loading && !page.data) return <Loading label={t("org.seating_loading")} />;
  if (page.error || !page.data) return <ErrorPanel title={t("checkout.seat_map_error")} message={page.error ?? ""} onRetry={page.reload} />;

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
          title={t("org.layout_version", { p0: layout.name, p1: layout.version })}
          subtitle={t("org.seating_edit_hint")}
          trailing={<StatusPill tone="neutral">{seats.length}{" "}{t("word.seats")}</StatusPill>}
        />
        <ul className="seat-summary" aria-label={t("org.seat_counts")}>
          <li><span className="seat-dot available" aria-hidden="true" />{counts.available}{" "}{t("word.available")}</li>
          <li><span className="seat-dot unavailable" aria-hidden="true" />{counts.unavailable}{" "}{t("org.not_on_sale_lower")}</li>
          <li><span className="seat-dot blocked" aria-hidden="true" />{counts.blocked}{" "}{t("word.blocked")}</li>
          <li><span className="seat-dot sold" aria-hidden="true" />{counts.sold + counts.held + counts.refund_pending}{" "}{t("org.held_sold")}</li>
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
