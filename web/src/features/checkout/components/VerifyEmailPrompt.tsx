import { useRef, useState } from "react";
import { getProfile, resendVerification } from "../../../api/auth";
import { describeError } from "../../../api/errors";
import { Button } from "../../../components/ui/Button";
import { FormMessage } from "../../../components/ui/Feedback";
import { t, useLocale } from "../../../i18n";
import { useAuth } from "../../auth/AuthContext";

type Action = "resend" | "reload";
type Feedback = { text: string; success: boolean };

// Checkout needs a verified email; offer to send the link again or to pick up
// a confirmation made elsewhere. Busy buttons stay focusable (aria-disabled).
export function VerifyEmailPrompt({ email }: { email: string }) {
  useLocale();
  const { setProfile } = useAuth();
  const [busy, setBusy] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({ text: "", success: false });
  const inFlight = useRef(false);

  const run = async (action: Action, work: () => Promise<Feedback>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(action);
    setFeedback({ text: "", success: false });
    try {
      setFeedback(await work());
    } catch (failure) {
      setFeedback({ text: describeError(failure), success: false });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const resend = () =>
    run("resend", async () => {
      await resendVerification(email);
      return { text: t("checkout.verify_email_sent", { email }), success: true };
    });

  // A verified profile unmounts this prompt, so the message only shows otherwise.
  const reload = () =>
    run("reload", async () => {
      const profile = await getProfile();
      setProfile(profile);
      return { text: profile.email_verified_at ? "" : t("checkout.verify_email_still_unverified"), success: false };
    });

  return (
    <div className="signin-prompt verify-prompt">
      <p>{t("checkout.verify_email_hint")}</p>
      <div className="verify-prompt-actions">
        <Button busy={busy === "resend"} aria-disabled={busy !== null} onClick={() => void resend()}>
          {busy === "resend" ? t("common.sending") : t("tickets.resend")}
        </Button>
        <Button variant="text" busy={busy === "reload"} aria-disabled={busy !== null} onClick={() => void reload()}>
          {busy === "reload" ? t("common.loading") : t("checkout.verify_email_confirmed")}
        </Button>
      </div>
      <FormMessage message={feedback.text} success={feedback.success} />
    </div>
  );
}
