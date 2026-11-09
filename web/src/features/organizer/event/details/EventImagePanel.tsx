import { t, useLocale } from "../../../../i18n";
import { useState, type ChangeEvent } from "react";
import { uploadEventImage, type EventImage } from "../../../../api/eventAdmin";
import { describeError, isNotImplemented } from "../../../../api/errors";
import type { EventView } from "../../../../api/types";
import { FormMessage, NotAvailableYet, Panel, PanelHeading, StatusPill, useToast } from "../../../../components/ui";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

// Event cover image on the PLANNED contract (POST /events/{id}/images, raw
// body). Turns into a "coming soon" note once the server says it is missing.
export function EventImagePanel({ event }: { event: EventView }) {
  useLocale();
  const { notify } = useToast();
  const [planned, setPlanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [image, setImage] = useState<EventImage | null>(null);

  const choose = async (changeEvent: ChangeEvent<HTMLInputElement>) => {
    const file = changeEvent.target.files?.[0];
    changeEvent.target.value = "";
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setMessage(t("org.image_types_error"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage(t("org.image_size_error"));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      setImage(await uploadEventImage(event.id, file));
      notify(t("org.image_uploaded"));
    } catch (failure) {
      if (isNotImplemented(failure)) setPlanned(true);
      else setMessage(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <PanelHeading title={t("org.event_image")} subtitle={t("org.image_hint")} trailing={planned ? <StatusPill tone="neutral">{t("org.coming_soon")}</StatusPill> : null} />
      {planned ? <NotAvailableYet feature={t("org.event_images")} /> : null}
      {image ? <img className="event-image-preview" src={image.url} alt={t("org.cover_alt", { p0: event.title })} /> : null}
      <label className={`upload-area ${planned || busy ? "disabled" : ""}`}>
        <input type="file" accept={ACCEPTED.join(",")} disabled={planned || busy} onChange={(changeEvent) => void choose(changeEvent)} />
        <strong>{busy ? t("support.uploading") : t("org.choose_image")}</strong>
        <span>{planned ? t("org.image_not_live") : t("org.image_validated")}</span>
      </label>
      <FormMessage message={message} />
    </Panel>
  );
}
