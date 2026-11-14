import { useState } from "react";

import { describeError } from "@/api/errors";
import { ReasonDialog } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { t, useLocale } from "@/i18n";

export interface ModerationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  run: (reason: string) => Promise<void>;
}

// Asks for the reason recorded with a moderation decision, then runs it.
// A failure keeps the dialog open and explains why.
export function ModerationDialog({
  request,
  onClose,
}: {
  request: ModerationRequest | null;
  onClose: () => void;
}) {
  useLocale();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  async function submit(reason: string) {
    if (!request) return;
    if (!reason) {
      notify(t("admin.short_reason"));
      return;
    }
    setBusy(true);
    try {
      await request.run(reason);
      onClose();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ReasonDialog
      visible={request !== null}
      title={request?.title ?? ""}
      message={request?.message}
      confirmLabel={request?.confirmLabel}
      busy={busy}
      onCancel={onClose}
      onSubmit={(reason) => void submit(reason)}
    />
  );
}
