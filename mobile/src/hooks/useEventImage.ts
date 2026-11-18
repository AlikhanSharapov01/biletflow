import { useEffect, useState } from "react";

import { fetchEventImage } from "@/api/eventAdmin";
import type { EventImage } from "@/api/types";

// Image URLs need the session, so the bytes are downloaded into the app's cache
// and shown from there. An image id always has the same bytes, and an id only
// reaches a person inside an event they may see, so each image is downloaded
// once while the app runs and shared by every screen that shows it.
const downloads = new Map<string, Promise<string>>();

export function loadEventImage(image: EventImage): Promise<string> {
  let pending = downloads.get(image.id);
  if (!pending) {
    pending = fetchEventImage(image).then((file) => file.uri);
    // A failed download is tried again the next time the image is shown.
    pending.catch(() => downloads.delete(image.id));
    downloads.set(image.id, pending);
  }
  return pending;
}

// Lets tests start from a clean cache.
export function forgetEventImages(): void {
  downloads.clear();
}

export type EventImageState = { status: "loading" } | { status: "ready"; uri: string } | { status: "failed" };

export function useEventImage(image: EventImage | null | undefined): EventImageState | null {
  const [state, setState] = useState<{ id: string; value: EventImageState } | null>(null);
  const id = image?.id ?? "";

  useEffect(() => {
    if (!image) return;
    let active = true;
    setState({ id: image.id, value: { status: "loading" } });
    loadEventImage(image)
      .then((uri) => active && setState({ id: image.id, value: { status: "ready", uri } }))
      .catch(() => active && setState({ id: image.id, value: { status: "failed" } }));
    return () => {
      active = false;
    };
    // The download depends only on which image it is, not on the object passed in.
  }, [id]);

  if (!image) return null;
  return state && state.id === image.id ? state.value : { status: "loading" };
}
