import { act, renderHook } from "@testing-library/react-native";

import { syncOperations } from "@/api/offline";
import type { OfflineState } from "@/features/scanner/offlineStore";
import { loadOffline, saveProgress } from "@/features/scanner/offlineStore";
import { decideOffline } from "@/features/scanner/offlineVerify";
import { useOfflineScanning } from "@/features/scanner/useOfflineScanning";

jest.mock("@/api/offline", () => ({ downloadPackage: jest.fn(), registerDevice: jest.fn(), syncOperations: jest.fn() }));
jest.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ profile: { id: "u1" } }) }));
jest.mock("@/features/scanner/offlineStore", () => ({
  loadOffline: jest.fn(),
  savePackage: jest.fn(),
  saveProgress: jest.fn(),
}));
jest.mock("@/features/scanner/offlineVerify", () => ({ decideOffline: jest.fn(), TICKET_QR_PREFIX: "biletflow:ticket:" }));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(async () => "hash"),
  randomUUID: () => "uuid",
}));
jest.mock("expo-device", () => ({ modelName: "Test phone" }));
jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));

const mockedLoad = jest.mocked(loadOffline);
const mockedSave = jest.mocked(saveProgress);
const mockedDecide = jest.mocked(decideOffline);
const mockedSync = jest.mocked(syncOperations);

const QUEUED = { kind: "queued" as const, ticket_id: "t1", attendee_name: "Aru A.", ticket_type_name: "Standard", seat: null };
const SCAN = {
  target: { qrPayload: "biletflow:ticket:t1.sig", entryConfirmation: "biletflow:entry:x" },
  operationId: "op-1",
  capturedAt: "2026-11-08T10:00:00.000Z",
};

function saved(overrides: Partial<OfflineState> = {}): OfflineState {
  return {
    deviceId: "d1",
    event: { id: "e1" } as OfflineState["event"],
    pkg: { package_id: "p1", expires_at: "2026-11-08T20:00:00.000Z", manifest: {} as OfflineState["pkg"]["manifest"] },
    queue: [],
    nextSequence: 1,
    admitted: [],
    revocations: [],
    ...overrides,
  };
}

async function setup(state: OfflineState | null, onSynced = jest.fn()) {
  mockedLoad.mockResolvedValue(state);
  const view = await renderHook(() => useOfflineScanning("e1", onSynced));
  await act(async () => {});
  return view;
}

beforeEach(() => jest.clearAllMocks());

describe("useOfflineScanning", () => {
  it("saves an accepted scan to the queue before reporting it", async () => {
    mockedDecide.mockReturnValue(QUEUED);
    const { result } = await setup(saved());
    let outcome;
    await act(async () => {
      outcome = await result.current.decide(SCAN);
    });
    expect(outcome).toEqual(QUEUED);
    expect(result.current.pending).toBe(1);
    expect(mockedSave).toHaveBeenCalledWith(
      "u1",
      "e1",
      expect.objectContaining({
        nextSequence: 2,
        admitted: ["t1"],
        queue: [expect.objectContaining({ operation: expect.objectContaining({ operation_id: "op-1", sequence_number: 1 }) })],
      })
    );
  });

  it("doesn't report a scan as accepted when it couldn't be saved", async () => {
    mockedDecide.mockReturnValue(QUEUED);
    mockedSave.mockRejectedValueOnce(new Error("disk full"));
    const { result } = await setup(saved());
    let outcome;
    await act(async () => {
      outcome = await result.current.decide(SCAN);
    });
    expect(outcome).toBeNull();
    expect(result.current.pending).toBe(0);
  });

  it("can't decide without a list, or after it expires", async () => {
    const { result } = await setup(null);
    expect(await result.current.decide(SCAN)).toBeNull();
    const expired = await setup(saved({ pkg: { ...saved().pkg, expires_at: "2026-11-08T09:00:00.000Z" } }));
    expect(await expired.result.current.decide(SCAN)).toBeNull();
    expect(mockedDecide).not.toHaveBeenCalled();
  });

  it("uploads waiting scans on load and clears the ones the server answered", async () => {
    const operation = { operation_id: "op-1", sequence_number: 1, kind: "check_in" as const, captured_at: "x", qr_payload: "q", entry_confirmation: "c" };
    mockedSync.mockResolvedValue({
      results: [{ operation_id: "op-1", status: "conflict", code: "already_checked_in" }],
      refreshed: { revocations: [{ ticket_id: "t9", status: "refunded" }], admitted_ticket_ids: ["t1"] },
    });
    const onSynced = jest.fn();
    const { result } = await setup(saved({ queue: [{ ticketId: "t1", operation }] }), onSynced);
    expect(mockedSync).toHaveBeenCalledWith("d1", "p1", [operation]);
    expect(result.current.pending).toBe(0);
    expect(result.current.notice).toBe("Synced: 0 admitted, 1 sent to the organizer to review.");
    expect(onSynced).toHaveBeenCalled();
  });

  it("keeps the queue when an upload fails", async () => {
    const operation = { operation_id: "op-1", sequence_number: 1, kind: "check_in" as const, captured_at: "x", qr_payload: "q", entry_confirmation: "c" };
    mockedSync.mockRejectedValue(new Error("No connection."));
    const { result } = await setup(saved({ queue: [{ ticketId: "t1", operation }] }));
    expect(result.current.pending).toBe(1);
    await act(async () => {
      await result.current.sync();
    });
    expect(result.current.pending).toBe(1);
    expect(result.current.notice).toContain("Your scans are saved");
  });
});
