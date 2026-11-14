import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { describeError } from "@/api/errors";
import { resolveCampaignLink } from "@/api/promo";
import { ScrollScreen } from "@/components/layout";
import { ErrorPanel, LoadingState, PageHeading, SubtleButton } from "@/components/ui";
import { stashPromo } from "./utils/promo";
import { t, useLocale } from "@/i18n";

type State = { kind: "loading" } | { kind: "error"; message: string };

// /c/[token] — a campaign QR or link. Resolves to its event and promo code and
// forwards there. Campaign links never admit anyone: they are not tickets.
export function CampaignLinkScreen() {
  useLocale();
  const { token = "" } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    resolveCampaignLink(token)
      .then((link) => {
        if (!active) return;
        if (link.code) stashPromo(link.event_id, link.code);
        router.replace({
          pathname: "/events/[eventId]",
          params: link.code ? { eventId: link.event_id, promo: link.code } : { eventId: link.event_id },
        });
      })
      .catch((failure: unknown) => {
        if (!active) return;
        setState({ kind: "error", message: describeError(failure) });
      });
    return () => {
      active = false;
    };
    // The router object is stable; the link only resolves again for a new token.
  }, [token]);

  return (
    <ScrollScreen>
      <PageHeading eyebrow={t("checkout.campaign_link")} title={t("checkout.opening_title")} />
      {state.kind === "loading" ? <LoadingState message={t("checkout.opening_event")} /> : null}
      {state.kind === "error" ? <ErrorPanel title={t("checkout.campaign_link_error")} message={state.message} /> : null}
      {state.kind !== "loading" ? <SubtleButton label={t("nav.browse")} onPress={() => router.replace("/")} /> : null}
    </ScrollScreen>
  );
}
