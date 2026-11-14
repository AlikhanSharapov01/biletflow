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
import { t, useLocale } from "@/i18n";

export function TicketTypesTab({ event }: { event: EventView }) {
  useLocale();
  const { notify } = useToast();
  const types = useRequest(() => listTicketTypes(event.id), [event.id]);
  const [editingId, setEditingId] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });

  const create = async (input: TicketTypeInput) => {
    setState({ busy: true, message: "" });
    try {
      await createTicketType(event.id, input);
      notify(t("org.ticket_type_added"));
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
      notify(t("org.ticket_type_saved"));
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
        <PanelHeading title={t("organizer.ticket_types")} trailing={<StatusPill tone="neutral" label={t("mobile.org.types_configured", { p0: types.data?.length ?? 0 })} />} />
        {types.loading && !types.data ? <LoadingState message={t("org.ticket_types_loading")} /> : null}
        {types.error ? <ErrorPanel title={t("org.ticket_types_error")} message={types.error} onRetry={types.reload} /> : null}
        {types.data ? (
          <>
            {types.data.length === 0 ? <EmptyState message={t("org.no_ticket_types_hint")} /> : null}
            {types.data.map((type) => (
              <ListRow
                key={type.id}
                icon={type.kind === "paid" ? "₸" : "F"}
                title={`${type.name} · ${priceLabel(type.price_minor)}`}
                meta={t("org.available_sales", { p0: type.quantity_limit, p1: type.per_order_limit, p2: dateLabel(type.sales_open_at), p3: dateLabel(type.sales_close_at) })}
                trailing={
                  <View style={styles.trailing}>
                    <StatusPill tone={type.is_hidden ? "neutral" : "positive"} label={type.is_hidden ? t("org.hidden") : t("org.visible")} />
                    <SubtleButton label={editingId === type.id ? t("common.close") : t("common.edit")} onPress={() => setEditingId(editingId === type.id ? "" : type.id)} />
                  </View>
                }
              >
                {editingId === type.id ? (
                  <View style={formStyles.inline}>
                    <TicketTypeForm
                      key={type.id}
                      event={event}
                      initial={type}
                      submitLabel={t("org.save_ticket_type")}
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
        <PanelHeading title={t("org.add_ticket_type_title")} />
        <TicketTypeForm
          event={event}
          submitLabel={t("org.add_ticket_type")}
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
