import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { uploadEventImage, type EventImage } from "@/api/eventAdmin";
import { describeError, isNotImplemented } from "@/api/errors";
import type { EventView } from "@/api/types";
import { NotAvailableYet, Panel, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";

import { FormMessage } from "@/components/ui/FormMessage";
import { Intro } from "../../components/Intro";
import { SectionHeading } from "../../components/SectionHeading";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

// Event cover image on the PLANNED contract (POST /events/{id}/images, raw
// body). Turns into a "coming soon" note once the server says it is missing.
export function EventImagePanel({ event }: { event: EventView }) {
  const { notify } = useToast();
  const [planned, setPlanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [image, setImage] = useState<EventImage | null>(null);

  const choose = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ACCEPTED, copyToCacheDirectory: true, multiple: false });
    const file = picked.canceled ? null : picked.assets[0];
    if (!file) return;
    if (!file.mimeType || !ACCEPTED.includes(file.mimeType)) {
      setMessage("Choose a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size !== undefined && file.size > MAX_BYTES) {
      setMessage("The image must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      setImage(await uploadEventImage(event.id, { uri: file.uri, name: file.name, mimeType: file.mimeType }));
      notify("Event image uploaded.");
    } catch (failure) {
      if (isNotImplemented(failure)) setPlanned(true);
      else setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <SectionHeading
        title="Event image"
        subtitle="Shown on the event page and in discovery. PNG, JPEG or WebP up to 5 MB."
        trailing={planned ? <StatusPill tone="neutral" label="Coming soon" /> : null}
      />
      <View style={styles.stack}>
        {planned ? <NotAvailableYet feature="Event images" /> : null}
        {image ? (
          <Image source={{ uri: image.url }} style={styles.preview} contentFit="cover" accessibilityLabel={`Cover image for ${event.title}`} />
        ) : null}
        <SubtleButton label={busy ? "Uploading…" : "Choose an image"} onPress={() => void choose()} disabled={planned || busy} />
        <Intro>{planned ? "Uploads open once the server side is released." : "The image is checked on the server before it is shown."}</Intro>
        <FormMessage message={message} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  preview: { width: "100%", aspectRatio: 16 / 9, borderRadius: 8 },
});
