import { useEffect, useState } from "react";

import { getPublicSettings } from "@/api/settings";

// The last value the server gave, so a buyer who opens checkout again sees it
// at once. An admin can change it, so every mount still asks again.
let lastKnown: number | null = null;

// How long a hold lasts, from the platform settings: whole minutes, or null
// while it is not known (loading, or the settings could not be read). Callers
// then say "a short time" instead of naming a number that might be wrong. The
// hold's own expiry still comes from the server with the hold.
export function useHoldMinutes(): number | null {
  const [minutes, setMinutes] = useState<number | null>(lastKnown);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const value = (await getPublicSettings())?.hold_minutes;
        if (typeof value === "number" && Number.isInteger(value) && value > 0) {
          lastKnown = value;
          if (active) setMinutes(value);
        }
      } catch {
        // Keep what is known; the hint falls back to wording with no number.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return minutes;
}

// For tests: forget the remembered value.
export function resetHoldMinutes(): void {
  lastKnown = null;
}
