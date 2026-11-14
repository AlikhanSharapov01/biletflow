/** @jest-environment node */
import fs from "fs";
import path from "path";

import en from "./locales/en.json";
import kk from "./locales/kk.json";
import mobileEn from "./locales/mobile/en.json";
import mobileKk from "./locales/mobile/kk.json";
import mobileRu from "./locales/mobile/ru.json";
import ru from "./locales/ru.json";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { auditStrings } = require("../../scripts/audit-strings");

const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("translation catalogs", () => {
  it("keeps the web's catalogs unchanged, so both clients share keys and wording", () => {
    const web = path.join(__dirname, "../../../web/src/i18n/locales");
    for (const [locale, catalog] of Object.entries({ en, kk, ru })) {
      const copy = JSON.parse(fs.readFileSync(path.join(web, `${locale}.json`), "utf8"));
      expect(catalog).toEqual(copy);
    }
  });

  it("translates every app-only key into Kazakh and Russian with the same placeholders", () => {
    expect(Object.keys(mobileKk).sort()).toEqual(Object.keys(mobileEn).sort());
    expect(Object.keys(mobileRu).sort()).toEqual(Object.keys(mobileEn).sort());
    for (const [key, english] of Object.entries(mobileEn)) {
      for (const catalog of [mobileKk, mobileRu] as Record<string, string>[]) {
        expect(catalog[key]).toBeTruthy();
        expect([key, placeholders(catalog[key]!)]).toEqual([key, placeholders(english)]);
      }
    }
  });

  it("only adds keys the web does not have", () => {
    expect(Object.keys(mobileEn).filter((key) => key in en)).toEqual([]);
  });

  it("leaves no untranslated interface text in the app", () => {
    expect(Object.fromEntries(auditStrings())).toEqual({});
  });
});
