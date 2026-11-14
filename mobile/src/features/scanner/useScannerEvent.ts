import { useCallback, useEffect, useState } from "react";

import { getAdmissionCounts, getAssignedEvent } from "@/api/scanner";
import type { AdmissionCounts, AssignedEvent } from "@/api/types/scanner";
import { t } from "@/i18n";

// The event being scanned and its live admission counts.
export function useScannerEvent(eventId: string) {
  // undefined = still loading, null = not found / not assigned.
  const [event, setEvent] = useState<AssignedEvent | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState<AdmissionCounts | null>(null);

  const refreshCounts = useCallback(() => {
    getAdmissionCounts(eventId).then(setCounts, () => {
      // Counts are informational; keep showing the last known values.
    });
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    getAssignedEvent(eventId).then(
      (result) => {
        if (!cancelled) setEvent(result);
      },
      (err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : t("mobile.api.went_wrong"));
      }
    );
    refreshCounts();
    return () => {
      cancelled = true;
    };
  }, [eventId, refreshCounts]);

  return { event, loadError, counts, refreshCounts };
}
