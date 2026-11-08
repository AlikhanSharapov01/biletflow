import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/errors";
import { deferred } from "../../tests/helpers/fixtures";
import { useRequest } from "./useRequest";

describe("useRequest", () => {
  it("starts loading, then exposes the data", async () => {
    const pending = deferred<string>();
    const { result } = renderHook(() => useRequest(() => pending.promise, []));
    expect(result.current).toMatchObject({ data: null, error: null, loading: true });

    await act(async () => pending.resolve("ok"));
    expect(result.current).toMatchObject({ data: "ok", error: null, loading: false });
  });

  it("exposes a readable error message on failure", async () => {
    const { result } = renderHook(() => useRequest(() => Promise.reject(new ApiError("That event is no longer available.", 404, "event_not_found")), []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("That event is no longer available.");
    expect(result.current.data).toBeNull();
  });

  it("falls back to a generic message for non-Error rejections", async () => {
    const { result } = renderHook(() => useRequest(() => Promise.reject("nope"), []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Something went wrong. Please try again.");
  });

  it("ignores a stale response after the dependencies change", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const loads: Record<string, Promise<string>> = { a: first.promise, b: second.promise };
    const { result, rerender } = renderHook(({ id }: { id: string }) => useRequest(() => loads[id]!, [id]), { initialProps: { id: "a" } });

    rerender({ id: "b" });
    await act(async () => second.resolve("page b"));
    expect(result.current.data).toBe("page b");

    // The slower, older request must not overwrite the newer page.
    await act(async () => first.resolve("page a"));
    expect(result.current.data).toBe("page b");
    expect(result.current.loading).toBe(false);
  });

  it("ignores a stale failure after the dependencies change", async () => {
    const first = deferred<string>();
    const loads: Record<string, () => Promise<string>> = { a: () => first.promise, b: () => Promise.resolve("page b") };
    const { result, rerender } = renderHook(({ id }: { id: string }) => useRequest(() => loads[id]!(), [id]), { initialProps: { id: "a" } });
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.data).toBe("page b"));
    await act(async () => first.reject(new Error("old failure")));
    expect(result.current.error).toBeNull();
  });

  it("reloads with the latest loader and clears the previous error", async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("Temporary outage")).mockResolvedValueOnce("recovered");
    const { result } = renderHook(() => useRequest(load, []));
    await waitFor(() => expect(result.current.error).toBe("Temporary outage"));

    act(() => result.current.reload());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.data).toBe("recovered"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps the previous data visible while reloading", async () => {
    const load = vi.fn<() => Promise<number>>().mockResolvedValueOnce(1).mockReturnValueOnce(new Promise(() => undefined));
    const { result } = renderHook(() => useRequest(load, []));
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.reload());
    expect(result.current).toMatchObject({ data: 1, loading: true });
  });

  it("does not refetch when unrelated renders happen", async () => {
    const load = vi.fn(() => Promise.resolve("x"));
    const { rerender, result } = renderHook(() => useRequest(load, ["stable"]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender();
    rerender();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
