import { t, translate, useLocale } from "../../i18n";
import { useState } from "react";
import { describeError } from "../../api/errors";
import { acceptInvitation } from "../../api/organizations";
import { Button, ButtonLink } from "../../components/ui/Button";
import { useAuth } from "./AuthContext";
import { MissingToken, TokenLayout } from "./components/TokenLayout";
import { TOKEN_FLOW_IDLE, useHashToken, type TokenFlowState } from "./useHashToken";

export function AcceptInvitationPage() {
  useLocale();
  const token = useHashToken();
  const { profile } = useAuth();
  const [state, setState] = useState<TokenFlowState>(TOKEN_FLOW_IDLE);

  const accept = async () => {
    setState({ busy: true, done: false, message: "" });
    try {
      await acceptInvitation(token);
      setState({ busy: false, done: true, message: t("auth.joined") });
    } catch (failure) {
      setState({ busy: false, done: false, message: describeError(failure) });
    }
  };

  return (
    <TokenLayout eyebrow={t("auth.organizer_invitation")} title={t("auth.join_workspace")}>
      {!token ? (
        <MissingToken action={t("auth.action_accept")} />
      ) : (
        <>
          <p className="auth-subtitle">{t("auth.signed_in_as")}{" "}<strong>{profile?.email}</strong>{t("auth.invitation_address")}{" "}</p>
          {state.done ? (
            <ButtonLink variant="primary" to="/organizer">{t("auth.open_workspace")}{" "}</ButtonLink>
          ) : (
            <Button variant="primary" disabled={state.busy} onClick={() => void accept()}>
              {state.busy ? t("auth.joining") : t("auth.accept_invitation")}
            </Button>
          )}
          <p className={`auth-message ${state.done ? "success" : ""}`} role="status">
            {translate(state.message)}
          </p>
        </>
      )}
    </TokenLayout>
  );
}
