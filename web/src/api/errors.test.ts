import { describe, expect, it } from "vitest";
import { ApiError, describeError, errorCodeOf, failureMessage, googleErrorMessage, isNotImplemented } from "./errors";

const GENERIC = "Something went wrong. Please try again.";

describe("failureMessage", () => {
  it("prefers the message for a known backend code over the HTTP status", () => {
    expect(failureMessage("hold_expired", 409)).toBe("Your reservation expired. Choose your tickets again.");
    expect(failureMessage("admin_required", 403)).toBe("This area is for platform administrators.");
    // A mapped code wins even when the status alone would read as an outage.
    expect(failureMessage("database_unavailable", 503)).toBe("The service is temporarily unavailable. Please try again shortly.");
  });

  it("falls back to a status message for unknown or missing codes", () => {
    expect(failureMessage(undefined, 401)).toBe("Please sign in to continue.");
    expect(failureMessage("some_new_code", 403)).toBe("You don’t have permission to do that.");
    expect(failureMessage(undefined, 404)).toBe("This item could not be found.");
    expect(failureMessage(undefined, 422)).toBe("Some details need attention. Review the form and try again.");
    expect(failureMessage(undefined, 500)).toBe("The service is temporarily unavailable. Please try again shortly.");
    expect(failureMessage(undefined, 502)).toBe("The service is temporarily unavailable. Please try again shortly.");
  });

  it("names an unmapped conflict code in readable words", () => {
    expect(failureMessage("brand_new_conflict", 409)).toBe("This change conflicts with the current state (brand new conflict).");
    expect(failureMessage(undefined, 409)).toBe("This change conflicts with the current state. Refresh and try again.");
  });

  it("uses the generic message for other statuses, including network failure", () => {
    expect(failureMessage(undefined, 400)).toBe(GENERIC);
    expect(failureMessage(undefined, 0)).toBe(GENERIC);
    expect(failureMessage("", 418)).toBe(GENERIC);
  });

  it("covers the documented checkout, seat and promo error codes", () => {
    // Codes raised by backend/app/checkout_service.py and
    // paid_checkout_service.py; each needs its own message, not the fallback.
    const codes = [
      "event_capacity_exceeded",
      "per_order_limit_exceeded",
      "too_many_active_holds",
      "hold_not_found",
      "hold_already_consumed",
      "seat_unavailable",
      "seats_required",
      "duplicate_seat_selection",
      "recipient_allocation_mismatch",
      "payment_required",
      "paid_sales_inactive",
      "quote_expired",
    ];
    for (const code of codes) {
      expect(failureMessage(code, 409), code).not.toMatch(/conflicts with the current state/);
      expect(failureMessage(code, 409), code).not.toBe(GENERIC);
    }
  });
});

describe("messages added for previously unmapped backend codes", () => {
  // Codes raised by backend/app (event_api.py, payments_service.py,
  // idempotency.py) with the status they are raised with.
  const cases: Array<[code: string, status: number, message: string]> = [
    ["ticket_type_not_found", 404, "That ticket type no longer exists. Refresh the event and try again."],
    ["seat_not_found", 404, "That seat is no longer part of this event. Refresh the seat list and try again."],
    ["payment_not_found", 404, "That payment could not be found. Refresh the page and start the payment again."],
    ["idempotency_key_reused", 409, "This request was already sent with different details. Refresh and try again."],
  ];

  it.each(cases)("maps %s (%i) to its own message", (code, status, message) => {
    expect(failureMessage(code, status)).toBe(message);
    expect(failureMessage(code, status)).not.toBe(failureMessage(undefined, status));
    expect(failureMessage(code, status)).not.toMatch(/conflicts with the current state/);
    expect(describeError(new ApiError(failureMessage(code, status), status, code))).toBe(message);
  });

  it("keeps a code-less 404 as a planned endpoint but a coded one as a real failure", () => {
    expect(isNotImplemented(new ApiError("x", 404, "seat_not_found"))).toBe(false);
    expect(isNotImplemented(new ApiError("x", 404, "payment_not_found"))).toBe(false);
  });
});

describe("googleErrorMessage", () => {
  it("returns the mapped message or a Google-specific fallback", () => {
    expect(googleErrorMessage("google_authorization_denied")).toContain("cancelled");
    expect(googleErrorMessage("account_link_required")).toContain("Sign in with your password first");
    expect(googleErrorMessage("totally_unknown")).toBe("Google sign-in could not be completed. Please try again.");
  });
});

describe("ApiError", () => {
  it("is an Error carrying status and code", () => {
    const error = new ApiError("Nope", 409, "seat_unavailable");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ApiError");
    expect(error.message).toBe("Nope");
    expect(error.status).toBe(409);
    expect(error.code).toBe("seat_unavailable");
    expect(new ApiError("x", 500).code).toBeUndefined();
  });
});

describe("describeError", () => {
  it("shows the message of any Error", () => {
    expect(describeError(new ApiError("API said no", 400, "invalid_input"))).toBe("API said no");
    expect(describeError(new TypeError("boom"))).toBe("boom");
  });

  it("never shows raw values or empty messages", () => {
    expect(describeError(new Error(""))).toBe(GENERIC);
    expect(describeError("a string")).toBe(GENERIC);
    expect(describeError(null)).toBe(GENERIC);
    expect(describeError(undefined)).toBe(GENERIC);
    expect(describeError({ message: "not an Error instance" })).toBe(GENERIC);
  });
});

describe("errorCodeOf", () => {
  it("reads codes only from ApiError", () => {
    expect(errorCodeOf(new ApiError("x", 409, "promo_requote_required"))).toBe("promo_requote_required");
    expect(errorCodeOf(new ApiError("x", 500))).toBeUndefined();
    const lookalike = Object.assign(new Error("x"), { code: "promo_requote_required" });
    expect(errorCodeOf(lookalike)).toBeUndefined();
    expect(errorCodeOf("promo_requote_required")).toBeUndefined();
  });
});

describe("isNotImplemented", () => {
  it("treats 501 and code-less 404/405 as a planned endpoint", () => {
    expect(isNotImplemented(new ApiError("x", 501))).toBe(true);
    expect(isNotImplemented(new ApiError("x", 501, "anything"))).toBe(true);
    expect(isNotImplemented(new ApiError("x", 404))).toBe(true);
    expect(isNotImplemented(new ApiError("x", 405))).toBe(true);
  });

  it("does not hide a real not-found or any other failure", () => {
    expect(isNotImplemented(new ApiError("x", 404, "event_not_found"))).toBe(false);
    expect(isNotImplemented(new ApiError("x", 405, "method_blocked"))).toBe(false);
    expect(isNotImplemented(new ApiError("x", 500))).toBe(false);
    expect(isNotImplemented(new ApiError("x", 403))).toBe(false);
    expect(isNotImplemented(new ApiError("x", 0, "network"))).toBe(false);
    expect(isNotImplemented(new Error("404"))).toBe(false);
    expect(isNotImplemented(undefined)).toBe(false);
  });
});
