import { useEffect, useState } from "react";
import { fetchCampaignQr } from "../../../../api/campaigns";
import { describeError } from "../../../../api/errors";
import { saveBlob } from "../../../../api/files";
import type { Campaign } from "../../../../api/types/campaigns";
import { Button, ErrorPanel, Loading, StatusPill, useToast } from "../../../../components/ui";

// Server-rendered promo QR. It opens the campaign link; it is never an
// admission ticket and scanners reject it.
export function CampaignQr({ eventId, campaign }: { eventId: string; campaign: Campaign }) {
  const { notify } = useToast();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    fetchCampaignQr(eventId, campaign.id)
      .then((result) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(result);
        setBlob(result);
        setUrl(objectUrl);
      })
      .catch((failure: unknown) => active && setError(describeError(failure)));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [eventId, campaign.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(campaign.link_url);
      notify("Promo link copied.");
    } catch {
      notify("Copy failed. Select the link and copy it manually.");
    }
  };

  return (
    <div className="campaign-qr inline-form">
      <StatusPill tone="pending">Promo link — not an entry ticket</StatusPill>
      {error ? <ErrorPanel title="We couldn’t load the QR code." message={error} /> : null}
      {!error && !url ? <Loading label="Loading QR code…" /> : null}
      {url ? <img src={url} alt={`Promo QR code for ${campaign.name}. It opens the promo link and does not admit anyone.`} width={180} height={180} /> : null}
      <p className="campaign-link">{campaign.link_url}</p>
      <div className="form-actions">
        <Button size="sm" onClick={() => void copy()}>
          Copy link
        </Button>
        <Button size="sm" disabled={!blob} onClick={() => blob && saveBlob(blob, `promo-${campaign.code ?? campaign.id}.svg`)}>
          Download SVG
        </Button>
      </div>
    </div>
  );
}
