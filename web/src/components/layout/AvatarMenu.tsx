import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import type { Profile } from "../../api/types";
import { Avatar } from "../ui/Avatar";

interface AvatarMenuProps {
  profile: Profile;
  onSignOut: () => void;
}

// The avatar opens a small menu with the account and sign-out. A native
// <details> keeps it keyboard-operable; it closes on navigation, outside
// clicks and Escape.
export function AvatarMenu({ profile, onSignOut }: AvatarMenuProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  const { pathname } = useLocation();
  const name = profile.display_name;

  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      const element = menu.current;
      if (element?.open && !element.contains(event.target as Node)) element.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const element = menu.current;
      if (event.key !== "Escape" || !element?.open) return;
      element.open = false;
      element.querySelector("summary")?.focus();
    };
    document.addEventListener("click", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details className="avatar-menu" ref={menu}>
      <summary aria-label={`Account menu for ${name}`}>
        <Avatar name={name} />
      </summary>
      <div className="avatar-menu-panel">
        <div className="avatar-menu-head">
          <strong>{name}</strong>
          <span>{profile.email}</span>
        </div>
        <Link className="avatar-menu-item" to="/account">
          Account
        </Link>
        <button className="avatar-menu-item" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </details>
  );
}
