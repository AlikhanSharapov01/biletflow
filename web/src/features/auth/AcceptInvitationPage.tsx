import { useState } from "react";
import { describeError } from "../../api/errors";
import { acceptInvitation } from "../../api/organizations";
import { Button, ButtonLink } from "../../components/ui/Button";
import { useAuth } from "./AuthContext";
import { MissingToken, TokenLayout } from "./components/TokenLayout";
import { TOKEN_FLOW_IDLE, useHashToken, type TokenFlowState } from "./useHashToken";

export function AcceptInvitationPage() {
  const token = useHashToken();
  const { profile } = useAuth();
  const [state, setState] = useState<TokenFlowState>(TOKEN_FLOW_IDLE);

  const accept = async () => {
    setState({ busy: true, done: false, message: "" });
    try {
      await acceptInvitation(token);
      setState({ busy: false, done: true, message: "You joined the workspace. The owner can now assign you to events." });
    } catch (failure) {
      setState({ busy: false, done: false, message: describeError(failure) });
    }
  };

  return (
    <TokenLayout eyebrow="Organizer invitation" title="Join a workspace">
      {!token ? (
        <MissingToken action="accept the invitation" />
      ) : (
        <>
          <p className="auth-subtitle">
            You are signed in as <strong>{profile?.email}</strong>. The invitation must have been sent to this exact address.
          </p>
          {state.done ? (
            <ButtonLink variant="primary" to="/organizer">
              Open the organizer workspace
            </ButtonLink>
          ) : (
            <Button variant="primary" disabled={state.busy} onClick={() => void accept()}>
              {state.busy ? "Joining…" : "Accept invitation"}
            </Button>
          )}
          <p className={`auth-message ${state.done ? "success" : ""}`} role="status">
            {state.message}
          </p>
        </>
      )}
    </TokenLayout>
  );
}
