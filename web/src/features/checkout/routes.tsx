import { Route } from "react-router";
import { CampaignLinkPage } from "./CampaignLinkPage";

// Wire inside <AppShell> but outside <RequireAuth>: anyone may open a
// campaign link; the event page asks for sign-in when they reserve.
export const checkoutPublicRoutes = (
  <>
    <Route path="/c/:token" element={<CampaignLinkPage />} />
  </>
);
