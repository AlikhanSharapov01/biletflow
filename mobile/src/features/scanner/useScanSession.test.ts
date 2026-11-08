import { act, renderHook } from "@testing-library/react-native";

import { checkIn } from "@/api/scanner";
import type { AssignedEvent } from "@/api/types/scanner";
import { useScanSession } from "@/features/scanner/useScanSession";

jest.mock("@/api/scanner", () => ({ checkIn: jest.fn(), reverseCheckIn: jest.fn() }));
jest.mock("@/features/scanner/feedback", () => ({ feedback: jest.fn() }));
jest.mock("expo-crypto", () => {
  let n = 0;
  return { randomUUID: () => `op-${++n}` };
});

const mockedCheckIn = checkIn as jest.MockedFunction<typeof checkIn>;

const EVENT: AssignedEvent = {
  id: "e1",
  title: "Demo",
  venue: { name: "Hall", address: "Street 1", city: "Almaty" },
  starts_at: "2026-11-08T10:00:00Z",
  ends_at: "2026-11-08T12:00:00Z",
  time_zone: "Asia/Almaty",
  admission_opens_at: "2026-11-08T09:00:00Z",
  admission_closes_at: "2026-11-08T12:00:00Z",
  time_status: "active",
};

const ADMITTED = {
  kind: "admitted" as const,
  result: "admitted",
  check_in_id: "c1",
  ticket_id: "t1",
  event_id: "e1",
  attendee_name: "Aru A.",
  ticket_type_name: "Standard",
  seat: null,
  checked_in_at: "2026-11-08T10:05:00Z",
  replayed: false,
};

function scan(result: { current: ReturnType<typeof useScanSession> }, data: string) {
  result.current.handleScanned({ data } as Parameters<ReturnType<typeof useScanSession>["handleScanned"]>[0]);
}

beforeEach(() => mockedCheckIn.mockReset());

describe("useScanSession", () => {
  it("asks for an entry confirmation, then admits with the scanned one", async () => {
    mockedCheckIn.mockResolvedValueOnce({ kind: "rejected", code: "sign_in_required" }).mockResolvedValueOnce(ADMITTED);
    const refresh = jest.fn();
    const { result } = await renderHook(() => useScanSession("e1", EVENT, refresh));

    await act(async () => scan(result, "biletflow:ticket:t1.sig"));
    expect(result.current.phase).toEqual({ name: "confirm", ticket: { qrPayload: "biletflow:ticket:t1.sig" }, error: null });

    await act(async () => scan(result, "biletflow:entry:token"));
    expect(mockedCheckIn).toHaveBeenLastCalledWith(
      "e1",
      { qrPayload: "biletflow:ticket:t1.sig", entryConfirmation: "biletflow:entry:token" },
      expect.any(String),
      expect.any(String)
    );
    expect(result.current.phase.name).toBe("result");
    expect(refresh).toHaveBeenCalled();
  });

  it("rejects a ticket QR shown where the confirmation is expected", async () => {
    mockedCheckIn.mockResolvedValueOnce({ kind: "rejected", code: "sign_in_required" });
    const { result } = await renderHook(() => useScanSession("e1", EVENT, jest.fn()));
    await act(async () => scan(result, "biletflow:ticket:t1.sig"));
    await act(async () => scan(result, "biletflow:ticket:other"));
    const phase = result.current.phase;
    expect(phase.name === "confirm" && phase.error).toMatch(/isn’t an entry confirmation/);
    expect(mockedCheckIn).toHaveBeenCalledTimes(1);
  });

  it("checks in with a typed code after manual search", async () => {
    mockedCheckIn.mockResolvedValueOnce({ kind: "rejected", code: "sign_in_required" }).mockResolvedValueOnce(ADMITTED);
    const { result } = await renderHook(() => useScanSession("e1", EVENT, jest.fn()));
    await act(async () => result.current.openSearch());
    await act(async () =>
      result.current.checkInAttendee({
        ticket_id: "t1",
        attendee_name: "Aru A.",
        ticket_type_name: "Standard",
        seat: null,
        status: "valid",
        claimed: true,
        checked_in: false,
        check_in_id: null,
      })
    );
    await act(async () => result.current.submitEntryCode("1234 5678"));
    expect(mockedCheckIn).toHaveBeenLastCalledWith(
      "e1",
      { ticketId: "t1", entryCode: "12345678" },
      expect.any(String),
      expect.any(String)
    );
  });

  it("asks for the ticket first when only a confirmation is scanned", async () => {
    const { result } = await renderHook(() => useScanSession("e1", EVENT, jest.fn()));
    await act(async () => scan(result, "biletflow:entry:token"));
    const phase = result.current.phase;
    expect(phase.name === "result" && phase.view.title).toBe("Scan the ticket first");
    expect(mockedCheckIn).not.toHaveBeenCalled();
  });
});
