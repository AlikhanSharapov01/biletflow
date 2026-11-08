import { fireEvent, render, screen } from "@testing-library/react-native";

import { searchAttendees } from "@/api/scanner";
import { AttendeeSearchPanel } from "@/features/scanner/AttendeeSearchPanel";
import { ConfirmationPanel } from "@/features/scanner/ConfirmationPanel";

jest.mock("@/api/scanner", () => ({ searchAttendees: jest.fn() }));
const search = searchAttendees as jest.MockedFunction<typeof searchAttendees>;

describe("ConfirmationPanel", () => {
  it("submits a typed 8-digit code and ignores other characters", async () => {
    const onSubmitCode = jest.fn();
    await render(<ConfirmationPanel error={null} onSubmitCode={onSubmitCode} onCancel={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText("Entry code"), "1234-5678");
    await fireEvent.press(screen.getByText("Check in"));
    expect(onSubmitCode).toHaveBeenCalledWith("12345678");
  });

  it("shows why the last confirmation failed", async () => {
    await render(<ConfirmationPanel error="Confirmation expired." onSubmitCode={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText("Confirmation expired.")).toBeTruthy();
  });
});

describe("AttendeeSearchPanel", () => {
  it("searches after two characters and checks in a valid ticket", async () => {
    search.mockResolvedValue([
      {
        ticket_id: "t1",
        attendee_name: "Aru Akhmetova",
        ticket_type_name: "Standard",
        seat: null,
        status: "valid",
        claimed: true,
        checked_in: false,
        check_in_id: null,
      },
      {
        ticket_id: "t2",
        attendee_name: "Aru Bek",
        ticket_type_name: "Standard",
        seat: null,
        status: "valid",
        claimed: true,
        checked_in: true,
        check_in_id: "c2",
      },
    ]);
    const onCheckIn = jest.fn();
    await render(<AttendeeSearchPanel eventId="e1" onCheckIn={onCheckIn} onClose={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText("Search guests"), "Aru");
    expect(await screen.findByText("Aru Akhmetova")).toBeTruthy();
    expect(search).toHaveBeenCalledWith("e1", "Aru");
    expect(screen.getByText("Already checked in")).toBeTruthy();
    expect(screen.queryByLabelText("Check in Aru Bek")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Check in Aru Akhmetova"));
    expect(onCheckIn).toHaveBeenCalledWith(expect.objectContaining({ ticket_id: "t1" }));
  });
});
