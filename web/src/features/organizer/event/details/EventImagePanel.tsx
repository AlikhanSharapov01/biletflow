import { t, useLocale } from "../../../../i18n";
import { useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { deleteEventImage, reorderEventImages, setEventCover, uploadEventImage } from "../../../../api/eventAdmin";
import { describeError } from "../../../../api/errors";
import type { EventImage as EventImageRecord, EventView } from "../../../../api/types";
import { confirmAction } from "../../../../components/ui/ActionDialog";
import { EmptyState, FormMessage, Panel, PanelHeading, StatusPill, TextField, useToast } from "../../../../components/ui";
import { usePublicSettings } from "../../../../hooks/usePublicSettings";
import { fileSizeLabel } from "../../../support/attachments";
import { ImageRow, type ImageAction } from "./ImageRow";
import { ACCEPTED_IMAGE_TYPES, imageProblem, movedOrder } from "./imageRules";

// The request in flight: an upload, or one action on one image.
type Busy = "upload" | { id: string; action: ImageAction } | null;

// The event gallery: upload, choose the cover (the first image), reorder and
// delete. Answers from the server replace the local list, so the panel never
// guesses the order. Cancelled or suspended events are refused by the server.

export function EventImagePanel({ event }: { event: EventView }) {
  useLocale();
  const { notify } = useToast();
  const maxBytes = usePublicSettings()?.upload_max_bytes ?? null;
  const [images, setImages] = useState<EventImageRecord[]>(event.images);
  const [altText, setAltText] = useState(event.title);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState("");
  const gallery = useRef<HTMLOListElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  // The control to focus once the new list is rendered: reordering moves the row's DOM
  // node, and a browser blurs a focused element whose node is re-inserted or removed
  // (the cover button goes away on the new cover, the whole row on delete).
  const refocus = useRef<{ id: string; action: ImageAction } | "upload" | null>(null);
  useLayoutEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    if (target === "upload") {
      upload.current?.focus();
      return;
    }
    const rows = Array.from(gallery.current?.querySelectorAll<HTMLElement>("[data-image-id]") ?? []);
    rows.find((row) => row.dataset.imageId === target.id)?.querySelector<HTMLElement>(`[data-action="${target.action}"]`)?.focus();
  }, [images]);

  const run = async (key: NonNullable<Busy>, action: () => Promise<void>, done: string) => {
    setBusy(key);
    setMessage("");
    try {
      await action();
      notify(done);
    } catch (failure) {
      setMessage(describeError(failure));
    } finally {
      setBusy(null);
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
    const action = step < 0 ? "up" : "down";
    void run({ id: image.id, action }, async () => {
      const reordered = await reorderEventImages(event.id, order);
      refocus.current = { id: image.id, action };
      setImages(reordered);
    }, t("org.images_reordered"));
  };

  // The new cover has no Make cover button, so its Remove takes the focus.
  const makeCover = (image: EventImageRecord) =>
    void run({ id: image.id, action: "cover" }, async () => {
      const updated = await setEventCover(event.id, image.id);
      refocus.current = { id: image.id, action: "delete" };
      setImages(updated);
    }, t("org.cover_changed"));

  // Focus moves to the next image's Remove, else the previous one's, else the upload field.
  const remove = async (image: EventImageRecord) => {
    if (!(await confirmAction(t("org.image_delete_confirm", { p0: image.alt_text })))) return;
    void run({ id: image.id, action: "delete" }, async () => {
      await deleteEventImage(event.id, image.id);
      const index = images.findIndex((item) => item.id === image.id);
      const neighbour = images[index + 1] ?? images[index - 1];
      refocus.current = neighbour ? { id: neighbour.id, action: "delete" } : "upload";
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
        <ol className="image-gallery" ref={gallery}>
          {images.map((image, index) => (
            <ImageRow
              key={image.id}
              image={image}
              first={index === 0}
              last={index === images.length - 1}
              pending={busy !== null && busy !== "upload" && busy.id === image.id ? busy.action : null}
              locked={busy !== null}
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
        <label className={`upload-area ${busy !== null ? "disabled" : ""}`}>
          <input
            ref={upload}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            aria-busy={busy === "upload" || undefined}
            aria-disabled={busy !== null || undefined}
            onClick={(clickEvent) => {
              if (busy !== null) clickEvent.preventDefault();
            }}
            onChange={choose}
          />
          <strong>{busy === "upload" ? t("support.uploading") : t("org.choose_image")}</strong>
          <span>{t("org.image_validated")}</span>
        </label>
        <FormMessage message={message} />
      </div>
    </Panel>
  );
}
