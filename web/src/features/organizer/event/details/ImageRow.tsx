import { t, useLocale } from "../../../../i18n";
import type { EventImage as EventImageRecord } from "../../../../api/types";
import { Button, EventImage, StatusPill } from "../../../../components/ui";
import { fileSizeLabel } from "../../../support/attachments";

export type ImageAction = "up" | "down" | "cover" | "delete";

interface ImageRowProps {
  image: EventImageRecord;
  first: boolean;
  last: boolean;
  // The action running on this image, if any, and whether any request is running at all.
  pending: ImageAction | null;
  locked: boolean;
  onUp: () => void;
  onDown: () => void;
  onCover: () => void;
  onDelete: () => void;
}

// One gallery entry with its ordering, cover and delete actions.
export function ImageRow({ image, first, last, pending, locked, onUp, onDown, onCover, onDelete }: ImageRowProps) {
  useLocale();
  // Only the running action is busy; the other buttons wait without losing focus.
  const waits = (action: ImageAction) => ({ busy: pending === action, "aria-disabled": locked && pending !== action });
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
        <Button size="sm" {...waits("up")} disabled={first} onClick={onUp} aria-label={t("org.image_move_up", { p0: image.alt_text })}>↑</Button>
        <Button size="sm" {...waits("down")} disabled={last} onClick={onDown} aria-label={t("org.image_move_down", { p0: image.alt_text })}>↓</Button>
        {!image.is_cover ? <Button size="sm" {...waits("cover")} onClick={onCover}>{t("org.make_cover")}</Button> : null}
        <Button size="sm" variant="danger" {...waits("delete")} onClick={onDelete}>{t("common.remove")}</Button>
      </div>
    </li>
  );
}
