import { useEffect, useState } from "react";

function secondsUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
}

// Seconds left until an ISO timestamp, ticking once a second. Zero when the
// deadline passed or there is none.
//
// The tick is stored together with the deadline it was computed for, so the
// first render after the deadline changes reports the new value instead of
// the previous deadline's (often zero) — otherwise callers that treat zero as
// "expired" would expire a freshly created hold immediately.
export function useCountdown(deadline: string | null): number {
  const [tick, setTick] = useState(() => ({ deadline, seconds: secondsUntil(deadline) }));

  useEffect(() => {
    setTick({ deadline, seconds: secondsUntil(deadline) });
    if (!deadline) return;
    const timer = setInterval(() => {
      const left = secondsUntil(deadline);
      setTick({ deadline, seconds: left });
      if (left <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  return tick.deadline === deadline ? tick.seconds : secondsUntil(deadline);
}
