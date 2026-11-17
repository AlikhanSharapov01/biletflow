import { useEffect, useState } from "react";
import { fetchBlob } from "../../api/files";

interface EventImageProps {
  // Server path from EventImage.url / EventView.cover_image_url.
  src: string;
  alt: string;
  className?: string;
}

// Event images are served by the API; unpublished events need the bearer
// token, which a plain <img src> cannot send. The image is fetched with the
// session (anonymous viewers still get public images) and shown from a
// local object URL. Nothing is rendered until it loads or if it fails.
export function EventImage({ src, alt, className }: EventImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    setObjectUrl(null);
    fetchBlob(src)
      .then((blob) => {
        if (!active) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => {
        if (active) setObjectUrl(null);
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src]);

  return objectUrl ? <img className={className} src={objectUrl} alt={alt} /> : null;
}
