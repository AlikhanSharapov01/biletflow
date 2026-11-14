import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { downloadIcs, getCalendarLinks } from "@/api/calendar";
import { describeError, errorCodeOf } from "@/api/errors";
import { saveFile } from "@/api/files";
import { PanelHeading, SubtleButton } from "@/components/ui";
import { FormMessage } from "@/components/ui/FormMessage";
import { useRequest } from "@/hooks/useRequest";
import { t, useLocale } from "@/i18n";

// "Add to calendar": pre-filled links for Google / Outlook / Office 365, plus
// the .ics file, saved through the share sheet.
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

  const open = (url: string) => {
    setMessage("");
    Linking.openURL(url).catch((failure: unknown) => setMessage(describeError(failure)));
  };

  const download = async () => {
    setBusy(true);
    setMessage("");
    try {
      // Public or not, the file is fetched into the cache and handed to the
      // share sheet; the signed-in token is attached either way.
      await saveFile(await downloadIcs(data.ics_path, eventId));
    } catch (failure) {
      setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.block}>
      <PanelHeading title={t("calendar.add")} />
      <View style={styles.buttons}>
        <SubtleButton label="Google" onPress={() => open(data.google)} />
        <SubtleButton label="Outlook" onPress={() => open(data.outlook)} />
        <SubtleButton label="Office 365" onPress={() => open(data.office365)} />
        <SubtleButton label={busy ? t("calendar.downloading") : t("calendar.download")} disabled={busy} onPress={() => void download()} />
      </View>
      <FormMessage message={message} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 4, marginTop: 16 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
