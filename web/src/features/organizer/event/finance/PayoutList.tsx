import { t, useLocale } from "../../../../i18n";
import { useState } from "react";
import { describeError, errorCodeOf } from "../../../../api/errors";
import { listPayouts, simulatePayout } from "../../../../api/finance";
import type { Payout, PayoutSimulationTarget } from "../../../../api/types/finance";
import { Button, EmptyState, ErrorPanel, ListRow, Loading, StatusPill, useToast } from "../../../../components/ui";
import { useRequest } from "../../../../hooks/useRequest";
import { dateLabel, moneyLabel, statusLabel } from "../../../../utils/format";
import { payoutTone } from "../../../../utils/status";
import { simulationTargets } from "./payoutTransitions";

const PAGE_SIZE = 20;

interface PayoutListProps {
  eventId: string;
  // Changes whenever a payout is requested, so the list reloads.
  version: number;
  onChanged: () => void;
}

// Payout history, newest first. Demo transitions (eligible, sent, failed)
// exist only where the backend enables its simulator; elsewhere it answers
// 404 and the buttons are withdrawn.
export function PayoutList({ eventId, version, onChanged }: PayoutListProps) {
  useLocale();
  const { notify } = useToast();
  const [offset, setOffset] = useState(0);
  // The simulation running now; every other button waits (aria-disabled).
  const [running, setRunning] = useState<{ id: string; target: PayoutSimulationTarget } | null>(null);
  const [simulatorOff, setSimulatorOff] = useState(false);
  const page = useRequest(() => listPayouts(eventId, { limit: PAGE_SIZE, offset }), [eventId, offset, version]);

  const move = async (payout: Payout, target: PayoutSimulationTarget) => {
    setRunning({ id: payout.id, target });
    try {
      await simulatePayout(eventId, payout.id, target);
      notify(t("org.payout_now", { p0: statusLabel(target) }));
      page.reload();
      onChanged();
    } catch (failure) {
      if (errorCodeOf(failure) === "not_found") {
        setSimulatorOff(true);
        notify(t("org.payout_simulator_off"));
      } else {
        notify(describeError(failure));
      }
    } finally {
      setRunning(null);
    }
  };

  if (page.loading) return <Loading label={t("org.payouts_loading")} />;
  if (page.error) return <ErrorPanel title={t("org.payouts_error")} message={page.error} onRetry={page.reload} />;
  const rows = page.data ?? [];
  if (rows.length === 0 && offset === 0) return <EmptyState>{t("org.no_payouts")}</EmptyState>;

  return (
    <>
      <div className="list">
        {rows.map((payout) => (
          <ListRow
            key={payout.id}
            icon="₸"
            title={
              <>
                {moneyLabel(payout.amount_minor, payout.currency)}
                <StatusPill tone={payoutTone(payout.status)}>{statusLabel(payout.status)}</StatusPill>
              </>
            }
            meta={payout.sent_at ? t("org.payout_sent_on", { p0: dateLabel(payout.sent_at) }) : t("org.payout_requested_on", { p0: dateLabel(payout.created_at) })}
            note={payout.adjustment_minor !== 0 ? t("org.payout_adjustment", { p0: moneyLabel(payout.adjustment_minor, payout.currency) }) : undefined}
            actions={
              simulatorOff ? null : (
                <>
                  {simulationTargets(payout.transfer_status).map((target) => (
                    <Button
                      key={target}
                      size="sm"
                      variant={target === "failed" ? "danger" : "subtle"}
                      busy={running?.id === payout.id && running.target === target}
                      aria-disabled={running !== null && !(running.id === payout.id && running.target === target) ? true : undefined}
                      onClick={() => void move(payout, target)}
                    >
                      {t(target === "eligible" ? "org.payout_mark_eligible" : target === "sent" ? "org.payout_mark_sent" : "org.payout_mark_failed")}
                    </Button>
                  ))}
                </>
              )
            }
          />
        ))}
      </div>
      {offset > 0 || rows.length === PAGE_SIZE ? (
        <nav className="pagination" aria-label={t("org.payouts")}>
          <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>{t("common.previous")}</Button>
          <Button size="sm" disabled={rows.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>{t("common.next")}</Button>
        </nav>
      ) : null}
    </>
  );
}
