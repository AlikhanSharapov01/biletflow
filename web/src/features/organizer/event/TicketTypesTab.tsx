import { t, useLocale } from "../../../i18n";
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
    <div className="stack">
      <Panel>
        <PanelHeading title={t("organizer.ticket_types")} trailing={<StatusPill tone="neutral">{types.data?.length ?? 0}{" "}{t("word.configured")}</StatusPill>} />
        {types.loading ? <Loading label={t("org.ticket_types_loading")} /> : null}
        {types.error ? <ErrorPanel title={t("org.ticket_types_error")} message={types.error} onRetry={types.reload} /> : null}
        {types.data ? (
          <div className="list">
            {types.data.length === 0 ? <EmptyState>{t("org.no_ticket_types_hint")}</EmptyState> : null}
            {types.data.map((type) => (
              <ListRow
                key={type.id}
                icon={type.kind === "paid" ? "₸" : "F"}
                title={`${type.name} · ${priceLabel(type.price_minor)}`}
                meta={t("org.available_sales", { p0: type.quantity_limit, p1: type.per_order_limit, p2: dateLabel(type.sales_open_at), p3: dateLabel(type.sales_close_at) })}
                actions={
                  <>
                    <StatusPill tone={type.is_hidden ? "neutral" : "positive"}>{type.is_hidden ? t("org.hidden") : t("org.visible")}</StatusPill>
                    <Button size="sm" onClick={() => setEditingId(editingId === type.id ? "" : type.id)}>
                      {editingId === type.id ? t("common.close") : t("common.edit")}
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
                      submitLabel={t("org.save_ticket_type")}
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
    </div>
  );
}
