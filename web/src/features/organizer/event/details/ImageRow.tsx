import { t, useLocale } from "../../../../i18n";
import type { EventImage as EventImageRecord } from "../../../../api/types";
import { Button, EventImage, StatusPill } from "../../../../components/ui";
import { fileSizeLabel } from "../../../support/attachments";

interface ImageRowProps {
  image: EventImageRecord;
  first: boolean;
  last: boolean;
  busy: boolean;
  onUp: () => void;
  onDown: () => void;
  onCover: () => void;
  onDelete: () => void;
}

// One gallery entry with its ordering, cover and delete actions.
export function ImageRow({ image, first, last, busy, onUp, onDown, onCover, onDelete }: ImageRowProps) {
  useLocale();
  return (
    <li className="image-row">
      <EventImage className="image-thumb" src={image.url} alt={image.alt_text} />
      <div className="image-copy">
        <strong>{image.alt_text}</strong>
        <span>
          {fileSizeLabel(image.size_bytes)}
          {image.is_cover ? <StatusPill>{t("org.cover")}</StatusPill> : null}
        </span>
      </div>
      <div className="image-actions">
        <Button size="sm" busy={busy} disabled={first} onClick={onUp} aria-label={t("org.image_move_up", { p0: image.alt_text })}>↑</Button>
        <Button size="sm" busy={busy} disabled={last} onClick={onDown} aria-label={t("org.image_move_down", { p0: image.alt_text })}>↓</Button>
        {!image.is_cover ? <Button size="sm" busy={busy} onClick={onCover}>{t("org.make_cover")}</Button> : null}
        <Button size="sm" variant="danger" busy={busy} onClick={onDelete}>{t("common.remove")}</Button>
      </div>
    </li>
  );
}
