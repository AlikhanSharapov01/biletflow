import { useEffect, useState } from "react";

function secondsUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
}

// Seconds left until an ISO timestamp, ticking once a second. Zero when the
// deadline passed or there is none.
export function useCountdown(deadline: string | null): number {
  const [seconds, setSeconds] = useState(() => secondsUntil(deadline));

  useEffect(() => {
    setSeconds(secondsUntil(deadline));
    if (!deadline) return;
    const timer = setInterval(() => {
      const left = secondsUntil(deadline);
      setSeconds(left);
      if (left <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  return seconds;
}
