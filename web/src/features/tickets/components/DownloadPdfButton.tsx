import { useState } from "react";
import { saveFile } from "../../../api/files";
import { describeError } from "../../../api/errors";
import { downloadTicketPdf } from "../../../api/tickets";
import { Button, useToast } from "../../../components/ui";

// Fetches the A4 PDF with the bearer token and hands it to the save dialog.
export function DownloadPdfButton({ ticketId }: { ticketId: string }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      saveFile(await downloadTicketPdf(ticketId));
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="primary" disabled={busy} onClick={() => void download()}>
      {busy ? "Preparing PDF…" : "Download PDF"}
    </Button>
  );
}
