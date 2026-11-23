import { intlLocale } from "./intlLocale";

/**
 * Dates in Kazakh even where the engine has no Kazakh data. Chrome and Edge list "kk" as
 * supported but print "2026 M12 03" (checked on Chrome 157 and Edge 158), so `intlLocale`
 * falls back to Russian, which used to show Russian month names ("дек.", "2026 г.").
 * Here the Kazakh names come from these tables instead, laid out like the full Kazakh
 * locale data (CLDR, as in Node): "2026 ж. 03 жел., 12:38", "03 жел.", "3 жел., бс".
 * Engines that do have Kazakh data keep formatting it themselves.
 */
const MONTHS_SHORT = ["қаң.", "ақп.", "нау.", "сәу.", "мам.", "мау.", "шіл.", "там.", "қыр.", "қаз.", "қар.", "жел."];
const MONTHS_LONG = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];
// Sunday first, as Date.getDay().
const WEEKDAYS_SHORT = ["жс", "дс", "сс", "ср", "бс", "жм", "сб"];
const WEEKDAYS_LONG = ["жексенбі", "дүйсенбі", "сейсенбі", "сәрсенбі", "бейсенбі", "жұма", "сенбі"];

const pad = (value: number) => String(value).padStart(2, "0");
const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

// The calendar fields of a moment in the requested time zone, read from en-US, which every
// engine has.
function fields(date: Date, timeZone: string | undefined) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month")) - 1;
  const day = Number(get("day"));
  return {
    year: get("year"),
    month,
    day,
    // The weekday of that calendar day, counted the same way in every time zone.
    weekday: new Date(Date.UTC(year, month, day)).getUTCDay(),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function kazakhDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  const o: Intl.DateTimeFormatOptions = { ...options };
  if (o.dateStyle === "full" || o.dateStyle === "long") {
    o.year ??= "numeric";
    o.month ??= "long";
    o.day ??= "numeric";
    if (o.dateStyle === "full") o.weekday ??= "long";
  } else if (o.dateStyle) {
    o.year ??= "numeric";
    o.month ??= o.dateStyle === "short" ? "2-digit" : "short";
    o.day ??= "2-digit";
  }
  if (o.timeStyle) {
    o.hour ??= "2-digit";
    o.minute ??= "2-digit";
  }
  const f = fields(date, o.timeZone);
  const day = o.day === "2-digit" ? pad(f.day) : String(f.day);
  const numericMonth = o.month === "numeric" || o.month === "2-digit";
  const month =
    o.month === "long"
      ? o.day ? MONTHS_LONG[f.month] : capitalise(MONTHS_LONG[f.month]!)
      : numericMonth
        ? o.month === "2-digit" ? pad(f.month + 1) : String(f.month + 1)
        : MONTHS_SHORT[f.month];

  let text = "";
  if (o.year && o.month && o.day) text = numericMonth ? `${day}.${month}.${f.year}` : `${f.year} ж. ${day} ${month}`;
  else if (o.month && o.day) text = numericMonth ? `${day}.${month}` : `${day} ${month}`;
  else if (o.year && o.month) text = numericMonth ? `${month}.${f.year}` : `${f.year} ж. ${month}`;
  else text = [o.year ? f.year : "", o.month ? month : "", o.day ? day : ""].filter(Boolean).join(" ");

  if (o.weekday) {
    const weekday = o.weekday === "long" ? WEEKDAYS_LONG[f.weekday]! : WEEKDAYS_SHORT[f.weekday]!;
    text = text ? `${text}, ${weekday}` : weekday;
  }
  const time = o.hour && o.minute ? `${f.hour}:${f.minute}` : o.hour ? f.hour : "";
  return [text, time].filter(Boolean).join(", ");
}

// Formats a moment for the app language: the engine's own formatting, or the Kazakh tables
// above when the engine lacks Kazakh month names.
export function formatDateTime(locale: string, date: Date, options: Intl.DateTimeFormatOptions): string {
  const intl = intlLocale(locale);
  if (locale === "kk" && intl !== "kk") return kazakhDate(date, options);
  return new Intl.DateTimeFormat(intl, options).format(date);
}
