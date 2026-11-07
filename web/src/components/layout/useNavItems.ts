import { useAuth } from "../../features/auth/AuthContext";
import { useIsPlatformAdmin } from "../../features/admin/useIsPlatformAdmin";
import { NAV_ITEMS, type NavItem } from "./navigation";

// The primary sections this viewer may see: visitors get the public ones,
// signed-in users the rest, and platform admins also get Admin.
export function useNavItems(): NavItem[] {
  const { profile } = useAuth();
  const { isAdmin } = useIsPlatformAdmin();
  if (!profile) return NAV_ITEMS.filter((item) => item.public);
  return NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
}
