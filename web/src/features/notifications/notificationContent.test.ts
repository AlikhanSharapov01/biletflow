import { afterEach, describe, expect, it } from "vitest";
import type { AppNotification } from "../../api/types/notifications";
import { setLocale, t } from "../../i18n";
import { notificationContent } from "./notificationContent";

const notice: AppNotification = {
  id: "n1", kind: "purchase_confirmed", locale: "en", title: "Old English title", body: "Old English body",
  event_id: "e1", target: { type: "order", id: "order/1" },
  payload: { title: "Demo Night", starts_at: "2026-11-09T12:00:00Z", time_zone: "Asia/Almaty" },
  read_at: null, created_at: "2026-11-09T12:00:00Z",
};
afterEach(() => setLocale("en"));

describe("notifications follow the current interface language", () => {
  it.each(["ru", "kk"] as const)("rerenders archived English notifications in %s", (locale) => {
    setLocale(locale);
    const content = notificationContent(notice);
    expect(content.title).toBe(t("notice.purchase_confirmed.title", { title: "Demo Night" }));
    expect(content.body).toContain("/orders/order%2F1");
    expect(content.body).not.toContain("Old English");
    expect(notice.locale).toBe("en");
  });
  it("does not fail on an invalid historic time zone", () => {
    expect(() => notificationContent({ ...notice, payload: { ...notice.payload, time_zone: "invalid zone" } })).not.toThrow();
  });
  it("retains the server's copy for a future notification kind", () => {
    expect(notificationContent({ ...notice, kind: "future_kind" })).toEqual({ title: notice.title, body: notice.body });
  });
});
