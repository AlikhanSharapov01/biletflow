import { useMemo, useState } from "react";
import { View } from "react-native";

import { retryDelivery, retryJob } from "@/api/admin";
import type { AdminDelivery, AdminJob } from "@/api/types/admin";
import { ListRow, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { createRetryKeys } from "@/features/support/utils/retryKey";
import { t, useLocale } from "@/i18n";
import { dateLabel, statusLabel } from "@/utils/format";

import { contextLine, opsTone, shortId } from "../utils/ops";
import { ModerationDialog, type ModerationRequest } from "./ModerationDialog";
import { RowTitle } from "./RowTitle";

// Retry is offered only where the server says the row may be retried
// (`retryable`: exhausted and under the three-retry limit). The target
// checks run when it is asked, so a refusal is shown as the server's reason.
function useRetry(onDone: () => void) {
  const { notify } = useToast();
  const [pending, setPending] = useState<ModerationRequest | null>(null);
  // A retried request with the same row and reason reuses its Idempotency-Key.
  const keys = useMemo(() => createRetryKeys(), []);

  const ask = (kind: "job" | "delivery", id: string) =>
    setPending({
      title: kind === "job" ? t("mobile.admin.retry_job") : t("mobile.admin.retry_delivery"),
      message: t("mobile.admin.retry_reason"),
      confirmLabel: t("mobile.ui.retry"),
      run: async (reason) => {
        const key = keys.keyFor({ kind, id, reason });
        await (kind === "job" ? retryJob(id, reason, key) : retryDelivery(id, reason, key));
        keys.reset();
        notify(t("mobile.admin.retry_sent"));
        onDone();
      },
    });

  return { ask, dialog: <ModerationDialog request={pending} onClose={() => setPending(null)} /> };
}

// Job and notice kinds are internal codes, shown as they are (like last_error)
// rather than half-translated.
const attempts = (count: number, max: number | null) =>
  max ? t("mobile.admin.attempts_of", { p0: count, p1: max }) : t("mobile.admin.attempts_n", { p0: count });

export function JobRows({ items, onChanged }: { items: AdminJob[]; onChanged: () => void }) {
  useLocale();
  const retry = useRetry(onChanged);
  return (
    <View>
      {items.map((job) => (
        <ListRow
          key={job.id}
          icon="J"
          title={
            <RowTitle text={job.kind}>
              <StatusPill tone={opsTone(job.status)} label={statusLabel(job.status)} />
            </RowTitle>
          }
          meta={[
            attempts(job.attempt_count, job.max_attempts),
            job.admin_retry_count ? t("mobile.admin.admin_retries", { p0: job.admin_retry_count }) : "",
            dateLabel(job.created_at),
          ]
            .filter(Boolean)
            .join(" · ")}
          note={[job.last_error ? t("mobile.admin.last_error", { p0: job.last_error }) : "", contextLine(job.context)].filter(Boolean).join("\n") || undefined}
          trailing={job.retryable ? <SubtleButton label={t("mobile.ui.retry")} onPress={() => retry.ask("job", job.id)} /> : null}
        />
      ))}
      {retry.dialog}
    </View>
  );
}

export function DeliveryRows({ items, onChanged }: { items: AdminDelivery[]; onChanged: () => void }) {
  useLocale();
  const retry = useRetry(onChanged);
  return (
    <View>
      {items.map((delivery) => (
        <ListRow
          key={delivery.id}
          icon={delivery.channel === "email" ? "@" : "N"}
          title={
            <RowTitle text={delivery.kind}>
              <StatusPill tone={opsTone(delivery.status)} label={statusLabel(delivery.status)} />
            </RowTitle>
          }
          meta={[
            delivery.channel === "email" ? t("mobile.admin.channel_email") : t("mobile.admin.channel_in_app"),
            attempts(delivery.attempt_count, delivery.max_attempts),
            delivery.sent_at
              ? t("mobile.admin.sent_at", { p0: dateLabel(delivery.sent_at) })
              : delivery.next_attempt_at
                ? t("mobile.admin.next_attempt", { p0: dateLabel(delivery.next_attempt_at) })
                : dateLabel(delivery.created_at),
          ].join(" · ")}
          note={[
            delivery.last_error ? t("mobile.admin.last_error", { p0: delivery.last_error }) : "",
            `${t("admin.recipient")} ${shortId(delivery.recipient_user_id)}${delivery.target ? ` · ${statusLabel(delivery.target.type)} ${shortId(delivery.target.id)}` : ""}`,
          ]
            .filter(Boolean)
            .join("\n")}
          trailing={delivery.retryable ? <SubtleButton label={t("mobile.ui.retry")} onPress={() => retry.ask("delivery", delivery.id)} /> : null}
        />
      ))}
      {retry.dialog}
    </View>
  );
}
