import { useState } from "react";
import { resendVerification } from "../../../api/auth";
import { describeError } from "../../../api/errors";
import { Button } from "../../../components/ui/Button";
import { FormMessage } from "../../../components/ui/Feedback";
import { t, useLocale } from "../../../i18n";

interface Feedback {
  text: string;
  success: boolean;
}

// Checkout needs a verified email; offer to send the link again right here.
export function VerifyEmailPrompt({ email }: { email: string }) {
  useLocale();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await resendVerification(email);
      setFeedback({ text: t("checkout.verify_email_sent", { email }), success: true });
    } catch (failure) {
      setFeedback({ text: describeError(failure), success: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin-prompt verify-prompt">
      <p>{t("checkout.verify_email_hint")}</p>
      <Button size="sm" disabled={busy} aria-busy={busy} onClick={() => void resend()}>
        {t("checkout.verify_email_resend")}
      </Button>
      {feedback ? <FormMessage message={feedback.text} success={feedback.success} /> : null}
    </div>
  );
}
