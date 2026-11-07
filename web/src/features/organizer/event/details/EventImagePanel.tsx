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
      setMessage("Choose a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage("The image must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      setImage(await uploadEventImage(event.id, file));
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
      <PanelHeading title="Event image" subtitle="Shown on the event page and in discovery. PNG, JPEG or WebP up to 5 MB." trailing={planned ? <StatusPill tone="neutral">Coming soon</StatusPill> : null} />
      {planned ? <NotAvailableYet feature="Event images" /> : null}
      {image ? <img className="event-image-preview" src={image.url} alt={`Cover image for ${event.title}`} /> : null}
      <label className={`upload-area ${planned || busy ? "disabled" : ""}`}>
        <input type="file" accept={ACCEPTED.join(",")} disabled={planned || busy} onChange={(changeEvent) => void choose(changeEvent)} />
        <strong>{busy ? "Uploading…" : "Choose an image"}</strong>
        <span>{planned ? "Uploads open once the server side is released." : "The image is checked on the server before it is shown."}</span>
      </label>
      <FormMessage message={message} />
    </Panel>
  );
}
