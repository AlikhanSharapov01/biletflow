import { fireEvent, render, screen } from "@testing-library/react-native";

import { listOrders } from "@/api/orders";
import { openCase } from "@/api/support";
import type { SupportCase } from "@/api/types/support";
import { NewCaseScreen } from "@/features/support/NewCaseScreen";

const EVENT = "11111111-1111-4111-8111-111111111111";
const mockReplace = jest.fn();
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams.current,
}));
jest.mock("@/context/ToastContext", () => ({ useToast: () => ({ notify: jest.fn() }) }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "client-key-1" }));
jest.mock("@/api/support");
jest.mock("@/api/orders");
jest.mock("@/api/organizations");

describe("NewCaseScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listOrders).mockResolvedValue([]);
  });

  it("opens a case about the event it was started from", async () => {
    mockParams.current = { eventId: EVENT };
    jest.mocked(openCase).mockResolvedValue({
      case: { id: "case-7" } as SupportCase,
      message: { replayed: false } as never,
    });
    await render(<NewCaseScreen />);
    expect(screen.getByLabelText("Open event")).toBeTruthy();
    // The event is the context, so no order needs choosing.
    expect(screen.queryByText("Which order is this about?")).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Subject"), "Parking");
    await fireEvent.changeText(screen.getByLabelText("Message"), "Is there parking at the venue?");
    await fireEvent.press(screen.getByText("Open case"));
    expect(openCase).toHaveBeenCalledWith({
      kind: "attendee",
      category: "delivery",
      subject: "Parking",
      body: "Is there parking at the venue?",
      event_id: EVENT,
      order_id: undefined,
      ticket_id: undefined,
      client_message_id: "client-key-1",
    });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/support/cases/[caseId]", params: { caseId: "case-7" } });
  });

  it("asks for a subject and message first", async () => {
    mockParams.current = {};
    await render(<NewCaseScreen />);
    expect(await screen.findByText("Which order is this about?")).toBeTruthy();
    await fireEvent.press(screen.getByText("Open case"));
    expect(screen.getByText("Add a subject and describe what happened.")).toBeTruthy();
    expect(openCase).not.toHaveBeenCalled();
  });
});
