import { minutesLabel, setLocale } from "@/i18n";

import { holdHint } from "./hold";

describe("hold hint", () => {
  afterEach(() => setLocale("en"));

  it("names the platform's hold time, with the right plural", () => {
    expect(holdHint("tickets", 10)).toBe("Tickets are held for 10 minutes while you add recipients.");
    expect(holdHint("tickets", 1)).toBe("Tickets are held for 1 minute while you add recipients.");
    expect(holdHint("seats", 15)).toBe("Seats are held for 15 minutes while you add recipients.");
  });

  it("says 'a short time', not a guessed number, when the setting is not known", () => {
    expect(holdHint("tickets", null)).toBe("Tickets are held for a short time while you add recipients.");
    expect(holdHint("seats", null)).toBe("Seats are held for a short time while you add recipients.");
  });

  it("agrees with the web's wording at the default of 10 minutes", () => {
    setLocale("ru");
    expect(holdHint("tickets", 10)).toBe("Билеты бронируются на 10 минут, пока вы указываете получателей.");
    expect(holdHint("seats", 10)).toBe("Места бронируются на 10 минут, пока вы указываете получателей.");
    setLocale("kk");
    expect(holdHint("tickets", 10)).toBe("Алушыларды енгізгенше билеттер 10 минутқа брондалады.");
    expect(holdHint("seats", 10)).toBe("Алушыларды енгізгенше орындар 10 минутқа брондалады.");
  });

  it("uses Russian forms after 'на' and one Kazakh form for every number", () => {
    setLocale("ru");
    expect([1, 2, 5, 11, 21, 22, 25].map(minutesLabel)).toEqual(["1 минуту", "2 минуты", "5 минут", "11 минут", "21 минуту", "22 минуты", "25 минут"]);
    setLocale("kk");
    expect([1, 2, 5, 10].map(minutesLabel)).toEqual(["1 минутқа", "2 минутқа", "5 минутқа", "10 минутқа"]);
    expect(holdHint("tickets", null)).toContain("қысқа уақытқа");
  });
});
