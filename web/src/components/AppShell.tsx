import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { initials } from "../utils/format";

const NAV = [
  { to: "/discover", label: "Discover events", glyph: "D" },
  { to: "/tickets", label: "My tickets", glyph: "T" },
  { to: "/orders", label: "Orders", glyph: "R" },
  { to: "/organizer", label: "Organizer", glyph: "O" },
  { to: "/account", label: "Profile & sessions", glyph: "A" },
] as const;

function pageLabel(pathname: string): string {
  if (pathname.startsWith("/events/")) return "Event";
  if (pathname.startsWith("/organizer/events/")) return "Manage event";
  return NAV.find((item) => pathname.startsWith(item.to))?.label ?? "BiletFlow";
}

export function AppShell() {
  const { status, profile, signOut } = useAuth();
  const location = useLocation();
  const name = profile?.display_name ?? "";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/discover" aria-label="BiletFlow home">
          <span className="brand-mark">b</span>BiletFlow
        </Link>
        <p className="workspace-label">Your BiletFlow</p>
        <nav className="role-nav live-nav" aria-label="Main navigation">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `role-link ${isActive ? "active" : ""}`}>
              <span className="nav-glyph">{item.glyph}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        {profile ? (
          <>
            <div className="preview-note">
              <strong>Connected workspace</strong>Your profile, events, and sessions are loaded from BiletFlow.
            </div>
            <div className="user-profile">
              <div className="avatar">{initials(name)}</div>
              <div className="user-meta">
                <strong>{name}</strong>
                <span>{profile.email}</span>
              </div>
              <button className="logout-button" type="button" title="Sign out" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <div className="sidebar-signin">
            <Link className="primary-button" to="/sign-in" state={{ from: location.pathname }}>
              {status === "restoring" ? "Checking session…" : "Sign in"}
            </Link>
          </div>
        )}
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <span>BiletFlow</span>
            <span aria-hidden="true">/</span>
            <span className="crumb-current">{pageLabel(location.pathname)}</span>
          </div>
          <div className="topbar-right">
            {profile ? (
              <>
                <span className="today">{profile.email}</span>
                <div className="avatar">{initials(name)}</div>
              </>
            ) : null}
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
