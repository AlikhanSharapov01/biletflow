import { t, useLocale } from "../../../i18n";
import { QRCodeSVG } from "qrcode.react";

// The second, short-lived QR. Styled apart from the ticket QR so staff and
// attendees never confuse the two (different purpose, prefix and key).
export function EntryQr({ token }: { token: string }) {
  useLocale();
  return (
    <figure className="entry-qr">
      <figcaption>{t("tickets.entry_title")}</figcaption>
      <div className="entry-qr-box">
        <QRCodeSVG value={token} size={176} level="M" marginSize={2} title={t("tickets.entry_qr")} />
      </div>
    </figure>
  );
}
