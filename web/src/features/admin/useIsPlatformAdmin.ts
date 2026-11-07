import { useEffect, useState } from "react";
import { getAdminMe } from "../../api/admin";
import { ApiError } from "../../api/errors";
import { useAuth } from "../auth/AuthContext";

// Answers per signed-in user are remembered for the page's lifetime, so the
// nav tab and the admin pages ask GET /admin/me only once.
const answers = new Map<string, boolean>();

export interface PlatformAdminState {
  isAdmin: boolean;
  checking: boolean;
}

// True only for platform admins (GET /api/v1/admin/me succeeds). A 403
// admin_required, an anonymous visitor or any failure means false. This is a
// display hint: the server still checks the role on every admin call.
export function useIsPlatformAdmin(): PlatformAdminState {
  const { status, profile } = useAuth();
  const userId = status === "authenticated" ? (profile?.id ?? "") : "";
  const [answer, setAnswer] = useState<{ userId: string; isAdmin: boolean } | null>(() =>
    userId && answers.has(userId) ? { userId, isAdmin: answers.get(userId) ?? false } : null,
  );

  useEffect(() => {
    if (!userId) return;
    const known = answers.get(userId);
    if (known !== undefined) {
      setAnswer({ userId, isAdmin: known });
      return;
    }
    let active = true;
    getAdminMe()
      .then((me) => {
        answers.set(userId, me.is_platform_admin);
        if (active) setAnswer({ userId, isAdmin: me.is_platform_admin });
      })
      .catch((failure: unknown) => {
        // Remember a definite "no"; retry later after network or server errors.
        if (failure instanceof ApiError && (failure.status === 403 || failure.status === 401)) answers.set(userId, false);
        if (active) setAnswer({ userId, isAdmin: false });
      });
    return () => {
      active = false;
    };
  }, [userId]);

  if (status === "restoring") return { isAdmin: false, checking: true };
  if (!userId) return { isAdmin: false, checking: false };
  if (!answer || answer.userId !== userId) return { isAdmin: false, checking: true };
  return { isAdmin: answer.isAdmin, checking: false };
}
