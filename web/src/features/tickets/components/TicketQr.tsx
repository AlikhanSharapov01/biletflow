import { t, useLocale } from "../../../i18n";
import { QRCodeSVG } from "qrcode.react";

interface TicketQrProps {
  payload: string | null;
  size?: number;
}

// Renders the signed QR payload the backend issued. The payload itself is the
// credential, so it is only present for the ticket's own recipient.
export function TicketQr({ payload, size = 232 }: TicketQrProps) {
  useLocale();
  if (!payload) {
    return (
      <div className="qr-box qr-missing" role="img" aria-label={t("tickets.qr_unavailable")}>
        <p>{t("tickets.qr_holder_only")}</p>
      </div>
    );
  }
  return (
    <div className="qr-box">
      <QRCodeSVG value={payload} size={size} level="M" marginSize={2} title={t("tickets.admission_qr")} />
    </div>
  );
}
