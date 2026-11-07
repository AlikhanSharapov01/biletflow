import { Route } from "react-router";
import { CasePage } from "./CasePage";
import { NewCasePage } from "./NewCasePage";
import { SupportPage } from "./SupportPage";

// Signed-in support routes. Place inside the AppShell's <RequireAuth> group.
export const supportRoutes = (
  <>
    <Route path="/support" element={<SupportPage />} />
    <Route path="/support/new" element={<NewCasePage />} />
    <Route path="/support/cases/:caseId" element={<CasePage />} />
  </>
);
