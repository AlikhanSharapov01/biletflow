import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import { describeError, isNotImplemented } from "../../api/errors";
import { resolveCampaignLink } from "../../api/promo";
import { ButtonLink, ErrorPanel, Loading, NotAvailableYet, PageHeading } from "../../components/ui";
import { stashPromo } from "./utils/promo";

type State = { kind: "loading" } | { kind: "redirect"; to: string } | { kind: "planned" } | { kind: "error"; message: string };

// /c/:token — a campaign QR or link. Resolves to its event and promo code and
// forwards there. Campaign links never admit anyone: they are not tickets.
export function CampaignLinkPage() {
  const { token = "" } = useParams();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    resolveCampaignLink(token)
      .then((link) => {
        if (!active) return;
        const path = `/events/${encodeURIComponent(link.event_id)}`;
        if (link.code) stashPromo(link.event_id, link.code);
        setState({ kind: "redirect", to: link.code ? `${path}?promo=${encodeURIComponent(link.code)}` : path });
      })
      .catch((failure: unknown) => {
        if (!active) return;
        setState(isNotImplemented(failure) ? { kind: "planned" } : { kind: "error", message: describeError(failure) });
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (state.kind === "redirect") return <Navigate to={state.to} replace />;

  return (
    <>
      <PageHeading eyebrow="Campaign link" title="Opening your event." />
      {state.kind === "loading" ? <Loading label="Opening the event…" /> : null}
      {state.kind === "planned" ? (
        <NotAvailableYet feature="Campaign links">
          This link will open its event with the promo code applied once campaigns are released. You can still browse events.
        </NotAvailableYet>
      ) : null}
      {state.kind === "error" ? <ErrorPanel title="This campaign link doesn’t work." message={state.message} /> : null}
      {state.kind !== "loading" ? <ButtonLink to="/discover">Browse events</ButtonLink> : null}
    </>
  );
}
