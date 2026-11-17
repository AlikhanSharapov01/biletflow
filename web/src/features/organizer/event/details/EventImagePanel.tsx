import { t, useLocale } from "../../../../i18n";
import { useState, type ChangeEvent } from "react";
import { deleteEventImage, reorderEventImages, setEventCover, uploadEventImage } from "../../../../api/eventAdmin";
import { describeError } from "../../../../api/errors";
import type { EventImage as EventImageRecord, EventView } from "../../../../api/types";
import { confirmAction } from "../../../../components/ui/ActionDialog";
import { EmptyState, FormMessage, Panel, PanelHeading, StatusPill, TextField, useToast } from "../../../../components/ui";
import { usePublicSettings } from "../../../../hooks/usePublicSettings";
import { fileSizeLabel } from "../../../support/attachments";
import { ImageRow } from "./ImageRow";
import { ACCEPTED_IMAGE_TYPES, imageProblem, movedOrder } from "./imageRules";

// The event gallery: upload, choose the cover (the first image), reorder and
// delete. Answers from the server replace the local list, so the panel never
// guesses the order. Cancelled or suspended events are refused by the server.
export function EventImagePanel({ event }: { event: EventView }) {
  useLocale();
  const { notify } = useToast();
  const maxBytes = usePublicSettings()?.upload_max_bytes ?? null;
  const [images, setImages] = useState<EventImageRecord[]>(event.images);
  const [altText, setAltText] = useState(event.title);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const run = async (key: string, action: () => Promise<void>, done: string) => {
    setBusy(key);
    setMessage("");
    try {
      await action();
      notify(done);
    } catch (failure) {
      setMessage(describeError(failure));
    } finally {
      setBusy("");
    }
  };

  const choose = (changeEvent: ChangeEvent<HTMLInputElement>) => {
    const file = changeEvent.target.files?.[0];
    changeEvent.target.value = "";
    if (!file) return;
    const problem = imageProblem(file, maxBytes);
    const alt = altText.trim();
    if (problem || !alt) {
      setMessage(problem ?? t("org.image_alt_required"));
      return;
    }
    void run("upload", async () => {
      const uploaded = await uploadEventImage(event.id, file, alt);
      setImages((current) => [...current, uploaded].sort((a, b) => a.sort_order - b.sort_order));
    }, t("org.image_uploaded"));
  };

  const move = (image: EventImageRecord, step: -1 | 1) => {
    const order = movedOrder(images.map((item) => item.id), image.id, step);
    if (!order) return;
    void run(image.id, async () => setImages(await reorderEventImages(event.id, order)), t("org.images_reordered"));
  };

  const makeCover = (image: EventImageRecord) =>
    void run(image.id, async () => setImages(await setEventCover(event.id, image.id)), t("org.cover_changed"));

  const remove = async (image: EventImageRecord) => {
    if (!(await confirmAction(t("org.image_delete_confirm", { p0: image.alt_text })))) return;
    void run(image.id, async () => {
      await deleteEventImage(event.id, image.id);
      setImages((current) => current.filter((item) => item.id !== image.id));
    }, t("org.image_deleted"));
  };

  const hint = maxBytes !== null ? t("org.image_hint", { p0: fileSizeLabel(maxBytes) }) : t("org.image_hint_unknown");

  return (
    <Panel>
      <PanelHeading title={t("org.event_images")} subtitle={hint} trailing={<StatusPill tone="neutral">{images.length}</StatusPill>} />
      {images.length === 0 ? (
        <EmptyState>{t("org.no_images")}</EmptyState>
      ) : (
        <ol className="image-gallery">
          {images.map((image, index) => (
            <ImageRow
              key={image.id}
              image={image}
              first={index === 0}
              last={index === images.length - 1}
              busy={busy !== ""}
              onUp={() => move(image, -1)}
              onDown={() => move(image, 1)}
              onCover={() => makeCover(image)}
              onDelete={() => void remove(image)}
            />
          ))}
        </ol>
      )}
      <div className="form-stack">
        <TextField
          label={t("org.image_alt")}
          hint={t("org.image_alt_hint")}
          value={altText}
          maxLength={500}
          onChange={(changeEvent) => setAltText(changeEvent.target.value)}
        />
        <label className={`upload-area ${busy ? "disabled" : ""}`}>
          <input type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} disabled={busy !== ""} onChange={choose} />
          <strong>{busy === "upload" ? t("support.uploading") : t("org.choose_image")}</strong>
          <span>{t("org.image_validated")}</span>
        </label>
        <FormMessage message={message} />
      </div>
    </Panel>
  );
}
