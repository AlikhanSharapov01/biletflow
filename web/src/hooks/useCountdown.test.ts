import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCountdown } from "./useCountdown";

describe("useCountdown", () => {
  it("reports the new deadline on the very first render after it changes", () => {
    const { result, rerender } = renderHook(({ deadline }: { deadline: string | null }) => useCountdown(deadline), {
      initialProps: { deadline: null as string | null },
    });
    expect(result.current).toBe(0);

    // A hold created ten minutes ahead must never read as already expired.
    const seen: number[] = [];
    rerender({ deadline: new Date(Date.now() + 600_000).toISOString() });
    seen.push(result.current);
    expect(Math.min(...seen)).toBeGreaterThan(590);
  });

  it("is zero for a deadline in the past", () => {
    const { result } = renderHook(() => useCountdown(new Date(Date.now() - 1000).toISOString()));
    expect(result.current).toBe(0);
  });
});
