import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { getCampaignDetail, getOrderDetail, getSupportCaseDetail, getSyncConflictDetail } from "@/api/admin";
import { ErrorPanel, FactList, LoadingState, StatusPill, TextButton } from "@/components/ui";
import { categoryLabel } from "@/features/support/utils/supportLabels";
import { useRequest } from "@/hooks/useRequest";
import { t, useLocale } from "@/i18n";
import { colors, fonts } from "@/theme";
import { dateLabel, priceLabel, statusLabel } from "@/utils/format";

import { formStyles } from "../../organizer/components/formStyles";
import { opsTone, shortId } from "../utils/ops";

// Read-only details opened from a row (ADMIN_API.md "Operational
// inspection"). Nothing here writes; actions stay on their own screens.

function Loaded<T>({ load, deps, children }: { load: () => Promise<T>; deps: unknown[]; children: (data: T) => ReactNode }) {
  useLocale();
  const request = useRequest(load, deps);
  if (request.loading && !request.data) return <LoadingState message={t("mobile.admin.loading_details")} />;
  if (request.error || !request.data) {
    return <ErrorPanel title={t("mobile.admin.details_error")} message={request.error ?? ""} onRetry={request.reload} />;
  }
  return <View style={[formStyles.inline, styles.box]}>{children(request.data)}</View>;
}

function Heading({ text }: { text: string }) {
  return <Text style={styles.heading}>{text}</Text>;
}

function Lines({ lines, empty }: { lines: string[]; empty: string }) {
  if (lines.length === 0) return <Text style={styles.line}>{empty}</Text>;
  return (
    <View>
      {lines.map((line, index) => (
        <Text key={index} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const pill = (status: string) => <StatusPill tone={opsTone(status)} label={statusLabel(status)} />;

export function SupportCaseDetail({ caseId }: { caseId: string }) {
  const [orderOpen, setOrderOpen] = useState(false);
  return (
    <Loaded load={() => getSupportCaseDetail(caseId)} deps={[caseId]}>
      {(detail) => (
        <>
          <FactList
            items={[
              { label: t("mobile.admin.messages"), value: String(detail.message_count) },
              { label: t("support.assigned_to"), value: detail.case.assigned_to_user_id ? shortId(detail.case.assigned_to_user_id) : t("support.not_assigned") },
              { label: t("support.escalated"), value: detail.case.escalated_at ? dateLabel(detail.case.escalated_at) : t("mobile.admin.none") },
              { label: t("common.order"), value: detail.order ? `${shortId(detail.order.id)} · ${statusLabel(detail.order.status)}` : t("mobile.admin.none") },
              { label: t("common.ticket"), value: detail.ticket ? `${shortId(detail.ticket.id)} · ${statusLabel(detail.ticket.status)}` : t("mobile.admin.none") },
              { label: t("mobile.admin.your_roles"), value: detail.viewer_roles.length ? detail.viewer_roles.map(statusLabel).join(", ") : t("mobile.admin.none") },
            ]}
          />
          <Heading text={t("organizer.history")} />
          <Lines
            empty={t("mobile.admin.no_changes")}
            lines={detail.history.map(
              (change) =>
                `${dateLabel(change.created_at)} · ${statusLabel(change.change_kind)}: ${change.before_value ? statusLabel(change.before_value) : "—"} → ${
                  change.after_value ? statusLabel(change.after_value) : "—"
                }${change.reason ? ` (${change.reason})` : ""}`,
            )}
          />
          <Text style={styles.line}>{t("mobile.admin.case_text_hidden")}</Text>
          {detail.order ? (
            <TextButton
              label={orderOpen ? t("mobile.admin.hide_order") : t("mobile.admin.order_details")}
              onPress={() => setOrderOpen(!orderOpen)}
            />
          ) : null}
          {detail.order && orderOpen ? <OrderDetail orderId={detail.order.id} /> : null}
        </>
      )}
    </Loaded>
  );
}

export function OrderDetail({ orderId }: { orderId: string }) {
  return (
    <Loaded load={() => getOrderDetail(orderId)} deps={[orderId]}>
      {({ order, support_cases, deliveries, audit }) => (
        <>
          <FactList
            items={[
              { label: t("common.status"), value: pill(order.status) },
              { label: t("admin.buyer"), value: shortId(order.buyer_user_id) },
              { label: t("mobile.admin.payable"), value: priceLabel(order.payable_minor) },
              { label: t("common.discount"), value: priceLabel(order.discount_minor) },
              { label: t("checkout.processing_fee"), value: priceLabel(order.processing_fee_minor) },
              {
                label: t("checkout.payment"),
                value: order.payment ? `${statusLabel(order.payment.status)} · ${statusLabel(order.payment.environment)}` : t("mobile.admin.none"),
              },
              { label: t("event.refunds"), value: String(order.refunds.length) },
              { label: t("mobile.admin.confirmed_at"), value: order.confirmed_at ? dateLabel(order.confirmed_at) : "—" },
            ]}
          />
          <Heading text={t("common.tickets")} />
          <Lines
            empty={t("mobile.admin.none")}
            lines={order.items.map(
              (item) =>
                `${item.ticket_type_name} · ${item.recipient_name} · ${priceLabel(item.paid_minor)}${item.ticket ? ` · ${statusLabel(item.ticket.status)}` : ""}`,
            )}
          />
          <Heading text={t("support.ticket_delivery")} />
          <Lines
            empty={t("mobile.admin.none")}
            lines={deliveries.map(
              (job) =>
                `${t("common.ticket")} ${shortId(job.ticket_id)} · ${statusLabel(job.status)} · ${t("mobile.admin.attempts_n", { p0: job.attempt_count })}${
                  job.last_error ? ` · ${job.last_error}` : ""
                }`,
            )}
          />
          <Heading text={t("mobile.admin.linked_cases")} />
          <Lines
            empty={t("mobile.admin.none")}
            lines={support_cases.map((item) => `${shortId(item.id)} · ${categoryLabel(item.category)} · ${statusLabel(item.status)}`)}
          />
          <Heading text={t("mobile.admin.audit_trail")} />
          <Lines
            empty={t("mobile.admin.none")}
            lines={audit.map((row) => `${dateLabel(row.created_at)} · ${statusLabel(row.action)}${row.service_actor ? ` · ${row.service_actor}` : ""}`)}
          />
        </>
      )}
    </Loaded>
  );
}

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  return (
    <Loaded load={() => getCampaignDetail(campaignId)} deps={[campaignId]}>
      {({ code, report, redemptions, reservations }) => (
        <>
          <FactList
            items={[
              { label: t("common.code"), value: code ?? "—" },
              { label: t("org.redemptions"), value: String(report.redemptions) },
              { label: t("common.tickets"), value: t("mobile.admin.tickets_kept", { p0: report.tickets, p1: report.tickets_kept, p2: report.tickets_refunded }) },
              { label: t("common.discount"), value: priceLabel(report.discount_minor) },
              { label: t("mobile.org.collected"), value: priceLabel(report.collected_minor) },
              { label: t("event.refunds"), value: priceLabel(report.refunds_minor) },
              { label: t("mobile.org.net"), value: priceLabel(report.net_minor) },
              {
                label: t("mobile.admin.reservations"),
                value: Object.keys(reservations).length
                  ? Object.entries(reservations)
                      .map(([status, count]) => `${statusLabel(status)} ${count}`)
                      .join(", ")
                  : t("mobile.admin.none"),
              },
            ]}
          />
          <Heading text={t("mobile.admin.latest_redemptions")} />
          <Lines
            empty={t("mobile.admin.none")}
            lines={redemptions.map((row) => `${dateLabel(row.created_at)} · ${t("common.order")} ${shortId(row.order_id)} · −${priceLabel(row.discount_minor)}`)}
          />
        </>
      )}
    </Loaded>
  );
}

export function SyncConflictDetail({ conflictId }: { conflictId: string }) {
  return (
    <Loaded load={() => getSyncConflictDetail(conflictId)} deps={[conflictId]}>
      {(conflict) => (
        <FactList
          items={[
            { label: t("mobile.admin.operation"), value: `${statusLabel(conflict.operation.kind)} · ${statusLabel(conflict.operation.status)}` },
            { label: t("mobile.admin.device"), value: conflict.operation.device.label },
            { label: t("mobile.admin.device_time"), value: conflict.operation.captured_at_device ? dateLabel(conflict.operation.captured_at_device) : "—" },
            { label: t("mobile.admin.server_time"), value: dateLabel(conflict.operation.received_at_server) },
            {
              label: t("mobile.admin.existing_check_in"),
              value: conflict.existing_check_in
                ? `${dateLabel(conflict.existing_check_in.accepted_at)}${conflict.existing_check_in.reversed_at ? ` · ${statusLabel("reversed")}` : ""}`
                : t("mobile.admin.none"),
            },
            ...(conflict.resolution_note ? [{ label: t("mobile.admin.resolution"), value: conflict.resolution_note }] : []),
          ]}
        />
      )}
    </Loaded>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  heading: { marginTop: 6, color: colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "700" },
  line: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
});
