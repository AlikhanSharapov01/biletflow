import { fireEvent, render, screen } from "@testing-library/react-native";

import { ListRow } from "@/components/ui/ListRow";
import { NotAvailableYet } from "@/components/ui/NotAvailableYet";
import { QrCode, qrPath } from "@/components/ui/QrCode";

describe("shared UI", () => {
  it("makes a pressable row and reports presses", async () => {
    const onPress = jest.fn();
    await render(<ListRow title="VIP ticket" meta="Row A, seat 4" onPress={onPress} accessibilityLabel="Open VIP ticket" />);
    await fireEvent.press(screen.getByLabelText("Open VIP ticket"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Row A, seat 4")).toBeTruthy();
  });

  it("explains a feature that the server does not offer yet", async () => {
    await render(<NotAvailableYet feature="Analytics" />);
    expect(screen.getByText("Not available yet")).toBeTruthy();
    expect(screen.getByText("Analytics is coming soon.")).toBeTruthy();
  });

  it("draws a QR code with a quiet zone", async () => {
    const { size, path } = qrPath("bf1.ticket.payload");
    expect(size).toBeGreaterThan(21 + 7);
    expect(path.startsWith("M")).toBe(true);
    await render(<QrCode value="bf1.ticket.payload" label="Ticket QR code" />);
    expect(screen.getByLabelText("Ticket QR code")).toBeTruthy();
  });
});
