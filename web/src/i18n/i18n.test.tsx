import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeProfile } from "../../tests/helpers/fixtures";
import { updateProfile } from "../api/auth";
import { useAuth } from "../features/auth/AuthContext";
import { dateLabel, priceLabel } from "../utils/format";
import { NAV_ITEMS } from "../components/layout/navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LocalizedApp } from "./LocalizedApp";
import { categoryName, getLocale, setLocale, t, useLocale } from "./index";
import en from "./locales/en.json";
import ru from "./locales/ru.json";
import kk from "./locales/kk.json";

vi.mock("../api/auth", () => ({ updateProfile: vi.fn() }));
vi.mock("../features/auth/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../app/routes", () => ({ AppRoutes: () => <span>{t("nav.discover")}</span> }));
vi.mock("../components/ui/ActionDialog", () => ({ ActionDialogHost: () => null }));

const save = vi.fn();
beforeEach(() => {
  setLocale("en");
  vi.mocked(useAuth).mockReturnValue({ profile: null, setProfile: save } as unknown as ReturnType<typeof useAuth>);
});
afterEach(() => { setLocale("en"); localStorage.clear(); vi.clearAllMocks(); });

describe("localization", () => {
  it("keeps all three catalogs complete with matching interpolation parameters", () => {
    for (const catalog of [ru, kk]) {
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as Array<keyof typeof en>) {
        expect(catalog[key].trim()).not.toBe("");
        expect(catalog[key].match(/\{\w+\}/g)?.sort()).toEqual(en[key].match(/\{\w+\}/g)?.sort());
      }
    }
  });

  it.each(["en", "ru", "kk"] as const)("uses %s for categories, dates, money, and parameterized seat labels", (locale) => {
    setLocale(locale);
    const category = { name_en: "Concert", name_ru: "Концерт", name_kk: "Концерт" } as Parameters<typeof categoryName>[0];
    expect(categoryName(category)).toBe(category?.[`name_${locale}`]);
    expect(priceLabel(123456)).toBe(new Intl.NumberFormat(locale, { style: "currency", currency: "KZT", currencyDisplay: "narrowSymbol" }).format(1234.56));
    expect(dateLabel("2026-11-09T12:30:00Z", { dateStyle: "full", timeZone: "UTC" }))
      .toBe(new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(new Date("2026-11-09T12:30:00Z")));
    expect(t("format.section", { section: "A" })).not.toContain("{section}");
    expect(document.documentElement.lang).toBe(locale);
  });

  it("switches labels without remounting or clearing an edited field", () => {
    function Probe() {
      useLocale();
      return <><input aria-label="Editable" defaultValue="" /><p>{t("common.free")}</p><p>{NAV_ITEMS[0]?.label}</p></>;
    }
    render(<Probe />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Unsaved title" } });
    act(() => setLocale("ru"));
    expect(screen.getByText("Бесплатно")).toBeTruthy();
    expect(screen.getByText("Афиша")).toBeTruthy();
    act(() => setLocale("kk"));
    expect(screen.getByText("Тегін")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Unsaved title");
  });

  it("defaults to the profile language after profile restoration", async () => {
    vi.mocked(useAuth).mockReturnValue({ profile: makeProfile({ locale: "kk" }) } as ReturnType<typeof useAuth>);
    render(<LocalizedApp />);
    await waitFor(() => expect(getLocale()).toBe("kk"));
    expect(screen.getByText("Афиша")).toBeTruthy();
  });

  it("persists an authenticated switch to the profile before changing the interface", async () => {
    const profile = makeProfile();
    vi.mocked(useAuth).mockReturnValue({ profile, setProfile: save } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(updateProfile).mockResolvedValue({ ...profile, locale: "ru" });
    render(<LanguageSwitcher />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ru" } });
    await waitFor(() => expect(getLocale()).toBe("ru"));
    expect(updateProfile).toHaveBeenCalledWith({ locale: "ru" });
    expect(save).toHaveBeenCalledWith({ ...profile, locale: "ru" });
  });

  it("keeps the current language when profile persistence fails", async () => {
    vi.mocked(useAuth).mockReturnValue({ profile: makeProfile(), setProfile: save } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(updateProfile).mockRejectedValue(new Error("offline"));
    render(<LanguageSwitcher />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "kk" } });
    await waitFor(() => expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(false));
    expect(getLocale()).toBe("en");
    expect(save).not.toHaveBeenCalled();
  });

  it("lets anonymous visitors choose a cached language without updating a profile", () => {
    render(<LanguageSwitcher />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "kk" } });
    expect(getLocale()).toBe("kk");
    expect(localStorage.getItem("biletflow:locale")).toBe("kk");
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
