import { useState } from "react";

import { describeError } from "@/api/errors";
import { saveFile } from "@/api/files";
import { downloadTicketPdf } from "@/api/tickets";
import { PrimaryButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { t, useLocale } from "@/i18n";

// Fetches the A4 PDF with the bearer token and opens the share sheet, from
// which the person can save, print or send it.
export function DownloadPdfButton({ ticketId }: { ticketId: string }) {
  useLocale();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await saveFile(await downloadTicketPdf(ticketId));
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return <PrimaryButton label={busy ? t("tickets.preparing_pdf") : t("tickets.download_pdf")} disabled={busy} onPress={() => void download()} />;
}
