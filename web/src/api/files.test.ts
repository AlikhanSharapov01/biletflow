import { afterEach, expect, it, vi } from "vitest";
import { filenameFromDisposition, requestBlob } from "./files";
import { session } from "./session";

afterEach(() => { vi.unstubAllGlobals(); session.clear(); });

it("prefers UTF-8 filenames and falls back from malformed encoding", () => {
  expect(filenameFromDisposition("attachment; filename=backup.pdf; filename*=UTF-8''ticket%20one.pdf")).toBe("ticket one.pdf");
  expect(filenameFromDisposition("attachment; filename=backup.pdf; filename*=UTF-8''%ZZ")).toBe("backup.pdf");
  expect(filenameFromDisposition(null)).toBeNull();
});

it("downloads with query filters and retries once with refreshed credentials", async () => {
  session.set("old");
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response("", { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "new" })))
    .mockResolvedValueOnce(new Response("csv", { headers: { "Content-Disposition": 'attachment; filename="report.csv"' } }));
  vi.stubGlobal("fetch", fetchMock);
  const file = await requestBlob("/api/export", "fallback.csv", { limit: 20 });
  expect(file.filename).toBe("report.csv");
  expect(fetchMock.mock.calls[2]![0]).toBe("/api/export?limit=20");
  expect(new Headers(fetchMock.mock.calls[2]![1].headers).get("Authorization")).toBe("Bearer new");
});
