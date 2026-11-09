import { t, useLocale } from "../../../../i18n";
import { useEffect, useState } from "react";
import { fetchCampaignQr } from "../../../../api/campaigns";
import { describeError } from "../../../../api/errors";
import { saveBlob } from "../../../../api/files";
import type { Campaign } from "../../../../api/types/campaigns";
import { Button, ErrorPanel, Loading, StatusPill, useToast } from "../../../../components/ui";

// Server-rendered promo QR. It opens the campaign link; it is never an
// admission ticket and scanners reject it.
export function CampaignQr({ eventId, campaign }: { eventId: string; campaign: Campaign }) {
  useLocale();
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
      notify(t("org.link_copied"));
    } catch {
      notify(t("org.copy_failed"));
    }
  };

  return (
    <div className="campaign-qr inline-form">
      <StatusPill tone="pending">{t("org.promo_qr_caption")}</StatusPill>
      {error ? <ErrorPanel title={t("org.qr_error")} message={error} /> : null}
      {!error && !url ? <Loading label={t("org.loading_qr")} /> : null}
      {url ? <img src={url} alt={t("org.promo_qr_alt", { p0: campaign.name })} width={180} height={180} /> : null}
      <p className="campaign-link">{campaign.link_url}</p>
      <div className="form-actions">
        <Button size="sm" onClick={() => void copy()}>{t("org.copy_link")}</Button>
        <Button size="sm" disabled={!blob} onClick={() => blob && saveBlob(blob, `promo-${campaign.code ?? campaign.id}.svg`)}>{t("org.download_svg")}</Button>
      </div>
    </div>
  );
}
