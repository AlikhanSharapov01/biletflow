import { QRCodeSVG } from "qrcode.react";

// The second, short-lived QR. Styled apart from the ticket QR so staff and
// attendees never confuse the two (different purpose, prefix and key).
export function EntryQr({ token }: { token: string }) {
  return (
    <figure className="entry-qr">
      <figcaption>Entry confirmation — show with your ticket</figcaption>
      <div className="entry-qr-box">
        <QRCodeSVG value={token} size={176} level="M" marginSize={2} title="Entry confirmation QR code" />
      </div>
    </figure>
  );
}
