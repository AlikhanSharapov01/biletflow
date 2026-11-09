import { t, useLocale } from "../../../i18n";
import type { ReactNode } from "react";
import { Brand } from "../../../components/ui/Brand";
import { ButtonLink } from "../../../components/ui/Button";

// Centred card for the pages opened from emailed links.
export function TokenLayout({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  useLocale();
  return (
    <main className="token-screen">
      <div className="auth-box">
        <Brand to="/discover" />
        <p className="eyebrow token-eyebrow">{eyebrow}</p>
        <h1 className="token-title">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function MissingToken({ action }: { action: string }) {
  useLocale();
  return (
    <>
      <p className="auth-subtitle">{t("auth.missing_token_start")}{" "}{action}{t("auth.open_email_again")}</p>
      <ButtonLink variant="primary" to="/sign-in">{t("auth.go_sign_in")}{" "}</ButtonLink>
    </>
  );
}
