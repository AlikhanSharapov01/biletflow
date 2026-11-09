import { t, useLocale } from "../../../i18n";
import { useState } from "react";
import { downloadIcs, getCalendarLinks } from "../../../api/calendar";
import { saveFile } from "../../../api/files";
import { describeError, errorCodeOf } from "../../../api/errors";
import { Button, FormMessage, PanelHeading, buttonClass } from "../../../components/ui";
import { useRequest } from "../../../hooks/useRequest";

// "Add to calendar": pre-filled links for Google / Outlook / Office 365, plus
// the .ics file (a plain link for public events, a signed-in download otherwise).
export function CalendarLinks({ eventId }: { eventId: string }) {
  useLocale();
  const links = useRequest(
    () =>
      getCalendarLinks(eventId).catch((failure: unknown) => {
        // A cancelled event offers no new calendar entries.
        if (errorCodeOf(failure) === "event_cancelled") return null;
        throw failure;
      }),
    [eventId],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (links.loading || !links.data) {
    return links.error ? <FormMessage message={t("calendar.unavailable", { p0: links.error })} /> : null;
  }
  const data = links.data;

  const download = async () => {
    setBusy(true);
    setMessage("");
    try {
      saveFile(await downloadIcs(data.ics_path, eventId));
    } catch (failure) {
      setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  const external = { target: "_blank", rel: "noopener noreferrer", className: buttonClass({ size: "sm" }) } as const;

  return (
    <div className="calendar-links">
      <PanelHeading title={t("calendar.add")} />
      <div className="calendar-buttons">
        <a href={data.google} {...external}>
          Google<span className="visually-hidden">{" "}{t("calendar.google_hidden")}</span>
        </a>
        <a href={data.outlook} {...external}>
          Outlook<span className="visually-hidden">{t("calendar.outlook_hidden")}</span>
        </a>
        <a href={data.office365} {...external}>
          Office 365<span className="visually-hidden">{" "}{t("calendar.new_tab")}</span>
        </a>
        {data.ics_requires_sign_in ? (
          <Button size="sm" disabled={busy} onClick={() => void download()}>
            {busy ? t("calendar.downloading") : t("calendar.download")}
          </Button>
        ) : (
          <a href={data.ics_path} download className={buttonClass({ size: "sm" })}>{t("calendar.download")}{" "}</a>
        )}
      </div>
      <FormMessage message={message} />
    </div>
  );
}
