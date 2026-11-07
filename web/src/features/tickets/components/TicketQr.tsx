import { QRCodeSVG } from "qrcode.react";

interface TicketQrProps {
  payload: string | null;
  size?: number;
}

// Renders the signed QR payload the backend issued. The payload itself is the
// credential, so it is only present for the ticket's own recipient.
export function TicketQr({ payload, size = 232 }: TicketQrProps) {
  if (!payload) {
    return (
      <div className="qr-box qr-missing" role="img" aria-label="QR code unavailable">
        <p>The QR code is only shown to the ticket holder’s own account.</p>
      </div>
    );
  }
  return (
    <div className="qr-box">
      <QRCodeSVG value={payload} size={size} level="M" marginSize={2} title="Admission QR code" />
    </div>
  );
}
