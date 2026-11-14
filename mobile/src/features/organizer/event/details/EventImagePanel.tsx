import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { deleteEventImage, fetchEventImage, setCoverImage, uploadEventImage } from "@/api/eventAdmin";
import { describeError } from "@/api/errors";
import type { EventImage, EventView } from "@/api/types";
import { confirmAction, EmptyState, ListRow, Panel, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { fileSizeLabel } from "@/features/support/utils/attachments";

import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "../../components/formStyles";
import { Intro } from "../../components/Intro";
import { SectionHeading } from "../../components/SectionHeading";
import { t, useLocale } from "@/i18n";

const ACCEPTED = ["image/png", "image/jpeg"];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 10;

// The event's gallery (backend/CATALOG_API.md). The first image is the cover
// shown on the event page; the server validates and re-encodes every upload.
export function EventImagePanel({ event }: { event: EventView }) {
  useLocale();
  const { notify } = useToast();
  const [images, setImages] = useState<EventImage[]>(event.images ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const cover = images.find((image) => image.is_cover) ?? null;

  useEffect(() => setImages(event.images ?? []), [event.images]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (failure) {
      setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  const choose = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ACCEPTED, copyToCacheDirectory: true, multiple: false });
    const file = picked.canceled ? null : picked.assets[0];
    if (!file) return;
    if (!file.mimeType || !ACCEPTED.includes(file.mimeType)) {
      setMessage(t("mobile.org.choose_png_jpeg"));
      return;
    }
    if (file.size !== undefined && file.size > MAX_BYTES) {
      setMessage(t("org.image_size_error"));
      return;
    }
    await run(async () => {
      const uploaded = await uploadEventImage(event.id, { uri: file.uri, name: file.name, mimeType: file.mimeType }, t("mobile.org.image_alt", { p0: event.title }));
      setImages((current) => [...current, uploaded].sort((a, b) => a.sort_order - b.sort_order));
      notify(t("org.image_uploaded"));
    });
  };

  const makeCover = (image: EventImage) =>
    run(async () => {
      setImages(await setCoverImage(event.id, image.id));
      notify(t("mobile.org.cover_changed"));
    });

  const remove = async (image: EventImage) => {
    const confirmed = await confirmAction({
      title: t("mobile.org.delete_image_title"),
      message: image.is_cover ? t("mobile.org.next_becomes_cover") : t("mobile.org.removed_from_page"),
      confirmLabel: t("mobile.ui.delete"),
      destructive: true,
    });
    if (!confirmed) return;
    await run(async () => {
      await deleteEventImage(event.id, image.id);
      setImages((current) => current.filter((item) => item.id !== image.id).map((item, index) => ({ ...item, sort_order: index, is_cover: index === 0 })));
      notify(t("mobile.org.image_deleted"));
    });
  };

  return (
    <Panel>
      <SectionHeading
        title={t("org.event_images")}
        subtitle={t("mobile.org.images_hint")}
        trailing={<StatusPill tone="neutral" label={t("mobile.org.n_of_m", { p0: images.length, p1: MAX_IMAGES })} />}
      />
      <View style={formStyles.stack}>
        {cover ? <EventImagePreview image={cover} /> : <EmptyState message={t("mobile.org.no_images")} />}
        {images.map((image, index) => (
          <ListRow
            key={image.id}
            icon={String(index + 1)}
            title={image.is_cover ? t("mobile.org.cover_image") : t("mobile.org.image_n", { p0: index + 1 })}
            meta={`${image.mime_type === "image/png" ? "PNG" : "JPEG"} · ${fileSizeLabel(image.size_bytes)}`}
            trailing={image.is_cover ? <StatusPill tone="positive" label={t("mobile.org.image_cover")} /> : null}
          >
            <View style={formStyles.actions}>
              {!image.is_cover ? <SubtleButton label={t("mobile.org.make_cover")} disabled={busy} onPress={() => void makeCover(image)} /> : null}
              <SubtleButton danger label={t("mobile.ui.delete")} disabled={busy} onPress={() => void remove(image)} />
            </View>
          </ListRow>
        ))}
        <SubtleButton
          label={busy ? t("mobile.ui.working") : t("mobile.org.add_image")}
          onPress={() => void choose()}
          disabled={busy || images.length >= MAX_IMAGES}
        />
        <Intro>
          {images.length >= MAX_IMAGES ? t("mobile.api.image_limit") : t("org.image_validated")}
        </Intro>
        <FormMessage message={message} />
      </View>
    </Panel>
  );
}

// Image URLs need the session, so the bytes are fetched and shown from the cache.
function EventImagePreview({ image }: { image: EventImage }) {
  useLocale();
  const [uri, setUri] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUri("");
    setFailed(false);
    fetchEventImage(image)
      .then((file) => active && setUri(file.uri))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [image]);

  if (failed) return <Intro>{t("mobile.org.cover_load_error")}</Intro>;
  if (!uri) return <View style={styles.preview} />;
  return <Image source={{ uri }} style={styles.preview} contentFit="cover" accessibilityLabel={image.alt_text} />;
}

const styles = StyleSheet.create({
  preview: { width: "100%", aspectRatio: 16 / 9, borderRadius: 8 },
});
