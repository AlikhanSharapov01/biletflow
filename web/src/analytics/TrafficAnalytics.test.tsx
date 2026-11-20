import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useNavigate } from "react-router";
import { postMeasurement } from "../api/analytics";
import { AuthContext } from "../features/auth/AuthContext";
import { makeAuthValue, makeProfile } from "../../tests/helpers/fixtures";
import { TrafficAnalytics } from "./TrafficAnalytics";

vi.mock("../api/analytics", () => ({ postMeasurement: vi.fn() }));

let navigate: ReturnType<typeof useNavigate> = () => undefined;
function Navigator() {
  navigate = useNavigate();
  return null;
}

function mount(path: string, consent: boolean) {
  const value = makeAuthValue({ status: "authenticated", profile: makeProfile({ analytics_consent: consent }) });
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Navigator />
        <TrafficAnalytics />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => vi.mocked(postMeasurement).mockResolvedValue({ status: "accepted", reason: null }));
afterEach(() => vi.clearAllMocks());

describe("event page views", () => {
  it("counts a public event page once for a consenting person", async () => {
    const view = mount("/events/e1", true);
    expect(postMeasurement).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postMeasurement).mock.calls[0]![0]).toMatchObject({ name: "event_view", event_id: "e1", platform: "web", page_path: "/events/event" });
    view.rerender(
      <AuthContext.Provider value={makeAuthValue({ status: "authenticated", profile: makeProfile({ analytics_consent: true }) })}>
        <MemoryRouter initialEntries={["/events/e1"]}>
          <Navigator />
          <TrafficAnalytics />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(postMeasurement).toHaveBeenCalledTimes(1);

    await act(async () => navigate("/events/e2"));
    expect(postMeasurement).toHaveBeenCalledTimes(2);
    expect(vi.mocked(postMeasurement).mock.calls[1]![0]).toMatchObject({ event_id: "e2" });
  });

  it("sends nothing without consent", () => {
    mount("/events/e1", false);
    expect(postMeasurement).not.toHaveBeenCalled();
  });

  it("sends nothing outside public event pages", async () => {
    mount("/discover", true);
    await act(async () => navigate("/orders/o1"));
    await act(async () => navigate("/organizer/events/e1"));
    expect(postMeasurement).not.toHaveBeenCalled();
  });
});
