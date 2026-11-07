import type { ReactNode } from "react";
import { Brand } from "../../../components/ui/Brand";
import { ButtonLink } from "../../../components/ui/Button";

// Centred card for the pages opened from emailed links.
export function TokenLayout({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
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
  return (
    <>
      <p className="auth-subtitle">This link is missing its token, so it cannot {action}. Open the link from your email again.</p>
      <ButtonLink variant="primary" to="/sign-in">
        Go to sign in
      </ButtonLink>
    </>
  );
}
