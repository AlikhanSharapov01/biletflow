import { useState } from "react";
import { createTicketType, updateTicketType } from "../../../api/eventAdmin";
import { listTicketTypes } from "../../../api/catalog";
import { describeError } from "../../../api/errors";
import type { EventView, TicketType, TicketTypeInput } from "../../../api/types";
import { Button, EmptyState, ErrorPanel, ListRow, Loading, Panel, PanelHeading, StatusPill, useToast } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";
import { dateLabel, priceLabel } from "../../../utils/format";
import { TicketTypeForm } from "../components/TicketTypeForm";

export function TicketTypesTab({ event }: { event: EventView }) {
  const { notify } = useToast();
  const types = useRequest(() => listTicketTypes(event.id), [event.id]);
  const [editingId, setEditingId] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });

  const create = async (input: TicketTypeInput) => {
    setState({ busy: true, message: "" });
    try {
      await createTicketType(event.id, input);
      notify("Ticket type added.");
      setState({ busy: false, message: "" });
      types.reload();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  const update = async (type: TicketType, input: TicketTypeInput) => {
    setState({ busy: true, message: "" });
    try {
      await updateTicketType(event.id, type.id, input);
      notify("Ticket type saved.");
      setState({ busy: false, message: "" });
      setEditingId("");
      types.reload();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  return (
    <div className="stack">
      <Panel>
        <PanelHeading title="Ticket types" trailing={<StatusPill tone="neutral">{types.data?.length ?? 0} configured</StatusPill>} />
        {types.loading ? <Loading label="Loading ticket types…" /> : null}
        {types.error ? <ErrorPanel title="We couldn’t load ticket types." message={types.error} onRetry={types.reload} /> : null}
        {types.data ? (
          <div className="list">
            {types.data.length === 0 ? <EmptyState>No ticket types yet. Add one below so the event can be published.</EmptyState> : null}
            {types.data.map((type) => (
              <ListRow
                key={type.id}
                icon={type.kind === "paid" ? "₸" : "F"}
                title={`${type.name} · ${priceLabel(type.price_minor)}`}
                meta={`${type.quantity_limit} available · up to ${type.per_order_limit} per order · sales ${dateLabel(type.sales_open_at)} – ${dateLabel(type.sales_close_at)}`}
                actions={
                  <>
                    <StatusPill tone={type.is_hidden ? "neutral" : "positive"}>{type.is_hidden ? "Hidden" : "Visible"}</StatusPill>
                    <Button size="sm" onClick={() => setEditingId(editingId === type.id ? "" : type.id)}>
                      {editingId === type.id ? "Close" : "Edit"}
                    </Button>
                  </>
                }
              >
                {editingId === type.id ? (
                  <div className="inline-form">
                    <TicketTypeForm
                      key={type.id}
                      event={event}
                      initial={type}
                      submitLabel="Save ticket type"
                      busy={state.busy}
                      message={state.message}
                      onSubmit={(input) => update(type, input)}
                      onInvalid={(error) => setState({ busy: false, message: error })}
                      onCancel={() => setEditingId("")}
                    />
                  </div>
                ) : null}
              </ListRow>
            ))}
          </div>
        ) : null}
      </Panel>
      <Panel>
        <PanelHeading title="Add a ticket type" />
        <TicketTypeForm
          event={event}
          submitLabel="Add ticket type"
          busy={state.busy}
          message={editingId ? "" : state.message}
          onSubmit={create}
          onInvalid={(error) => setState({ busy: false, message: error })}
        />
      </Panel>
    </div>
  );
}
