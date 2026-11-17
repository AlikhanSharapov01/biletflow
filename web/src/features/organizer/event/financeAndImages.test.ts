import { describe, expect, it } from "vitest";
import { moneyLabel, percentLabel } from "../../../utils/format";
import { payoutTone } from "../../../utils/status";
import { imageProblem, movedOrder } from "./details/imageRules";
import { simulationTargets } from "./finance/payoutTransitions";

describe("accounting formatters", () => {
  it("shows zero and negative amounts in the server's currency", () => {
    expect(moneyLabel(0, "KZT")).toBe("₸0.00");
    expect(moneyLabel(664_000, "KZT")).toBe("₸6,640.00");
    expect(moneyLabel(-1_164_000, "KZT")).toBe("-₸11,640.00");
  });

  it("reads server percentages on a 0-100 scale", () => {
    expect(percentLabel(25)).toBe("25%");
    expect(percentLabel(33.333)).toBe("33.3%");
    expect(percentLabel(0)).toBe("0%");
  });
});

describe("payout simulator transitions", () => {
  it("follows pending -> eligible -> sent with failure before sending", () => {
    expect(simulationTargets("pending")).toEqual(["eligible", "failed"]);
    expect(simulationTargets("eligible")).toEqual(["sent", "failed"]);
    expect(simulationTargets("sent")).toEqual([]);
    expect(simulationTargets("failed")).toEqual([]);
  });

  it("picks a pill tone per payout status", () => {
    expect(payoutTone("sent")).toBe("positive");
    expect(payoutTone("failed")).toBe("blocked");
    expect(payoutTone("adjusted")).toBe("neutral");
    expect(payoutTone("pending")).toBe("pending");
    expect(payoutTone("eligible")).toBe("pending");
  });
});

describe("event image rules", () => {
  it("accepts PNG and JPEG only, matching the backend", () => {
    expect(imageProblem({ type: "image/png", size: 10 }, 100)).toBeNull();
    expect(imageProblem({ type: "image/jpeg", size: 10 }, 100)).toBeNull();
    expect(imageProblem({ type: "image/webp", size: 10 }, 100)).toBe("Choose a PNG or JPEG image.");
  });

  it("uses the platform limit and leaves the size to the server when it is unknown", () => {
    expect(imageProblem({ type: "image/png", size: 2048 }, 1024)).toBe("The image must be 1 KB or smaller.");
    expect(imageProblem({ type: "image/png", size: 1024 }, 1024)).toBeNull();
    expect(imageProblem({ type: "image/png", size: 50 * 1024 * 1024 }, null)).toBeNull();
    expect(imageProblem({ type: "image/png", size: 0 }, null)).toBe("The chosen file is empty.");
  });

  it("moves one image a step and refuses to move past either end", () => {
    expect(movedOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(movedOrder(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(movedOrder(["a", "b", "c"], "a", -1)).toBeNull();
    expect(movedOrder(["a", "b", "c"], "c", 1)).toBeNull();
    expect(movedOrder(["a"], "missing", 1)).toBeNull();
  });
});
