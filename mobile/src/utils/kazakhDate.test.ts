import { setLocale } from "@/i18n";
import { dateLabel, monthShort } from "@/utils/format";
import { clearIntlLocales } from "@/utils/intlLocale";
import { kazakhDate } from "@/utils/kazakhDate";

// Every option set the app formats dates with.
const SHAPES: Intl.DateTimeFormatOptions[] = [
  { dateStyle: "medium", timeStyle: "short" },
  { dateStyle: "medium" },
  { day: "2-digit" },
  { month: "short" },
  { month: "long" },
  { day: "2-digit", month: "short" },
  { day: "2-digit", month: "short", hour: "2-digit" },
  { weekday: "short", day: "numeric", month: "short" },
  { hour: "2-digit", minute: "2-digit" },
];
const MOMENTS = ["2026-12-03T07:38:00Z", "2027-01-01T18:05:00Z", "2026-05-31T23:59:00Z", "2026-09-14T00:00:00Z"];

describe("Kazakh dates without the engine's Kazakh data", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    clearIntlLocales();
    setLocale("en");
  });

  // Node ships the full Kazakh locale data, so its own output is the reference.
  it.each(SHAPES.map((shape) => [JSON.stringify(shape), shape] as const))("matches the full Kazakh data for %s", (_, shape) => {
    for (const at of MOMENTS) {
      const options = { ...shape, timeZone: "Asia/Almaty" };
      expect(kazakhDate(new Date(at), options)).toBe(new Intl.DateTimeFormat("kk", options).format(new Date(at)));
    }
  });

  it("uses Kazakh month names, not Russian, where the engine lacks them", () => {
    // Stand-in for an engine without Kazakh data: "kk" is not supported.
    const supported = Intl.DateTimeFormat.supportedLocalesOf.bind(Intl.DateTimeFormat);
    jest
      .spyOn(Intl.DateTimeFormat, "supportedLocalesOf")
      .mockImplementation((locales, options) => supported(locales ?? [], options).filter((locale) => locale !== "kk"));
    clearIntlLocales();
    setLocale("kk");
    const label = dateLabel("2026-12-03T07:38:00Z", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Almaty" });
    expect(label).toBe("2026 ж. 03 жел., 12:38");
    expect(label).not.toMatch(/дек|г\./);
    expect(monthShort("2026-12-03T07:38:00Z")).toBe("ЖЕЛ.");
  });
});
