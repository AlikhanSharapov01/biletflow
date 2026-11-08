import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { listTicketTypes } from "@/api/catalog";
import { createTicketType, updateTicketType } from "@/api/eventAdmin";
import { describeError } from "@/api/errors";
import type { EventView, TicketType, TicketTypeInput } from "@/api/types";
import { EmptyState, ErrorPanel, ListRow, LoadingState, Panel, PanelHeading, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { useRequest } from "@/hooks/useRequest";
import { dateLabel, priceLabel } from "@/utils/format";

import { formStyles } from "../components/formStyles";
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
    <>
      <Panel>
        <PanelHeading title="Ticket types" trailing={<StatusPill tone="neutral" label={`${types.data?.length ?? 0} configured`} />} />
        {types.loading && !types.data ? <LoadingState message="Loading ticket types…" /> : null}
        {types.error ? <ErrorPanel title="We couldn’t load ticket types." message={types.error} onRetry={types.reload} /> : null}
        {types.data ? (
          <>
            {types.data.length === 0 ? <EmptyState message="No ticket types yet. Add one below so the event can be published." /> : null}
            {types.data.map((type) => (
              <ListRow
                key={type.id}
                icon={type.kind === "paid" ? "₸" : "F"}
                title={`${type.name} · ${priceLabel(type.price_minor)}`}
                meta={`${type.quantity_limit} available · up to ${type.per_order_limit} per order · sales ${dateLabel(type.sales_open_at)} – ${dateLabel(type.sales_close_at)}`}
                trailing={
                  <View style={styles.trailing}>
                    <StatusPill tone={type.is_hidden ? "neutral" : "positive"} label={type.is_hidden ? "Hidden" : "Visible"} />
                    <SubtleButton label={editingId === type.id ? "Close" : "Edit"} onPress={() => setEditingId(editingId === type.id ? "" : type.id)} />
                  </View>
                }
              >
                {editingId === type.id ? (
                  <View style={formStyles.inline}>
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
                  </View>
                ) : null}
              </ListRow>
            ))}
          </>
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
    </>
  );
}

const styles = StyleSheet.create({
  trailing: { alignItems: "flex-end", gap: 6 },
});
