const pageLabels = {
  discover: "Discover events",
  organizer: "Organizer",
  account: "Profile & sessions",
};

const messages = {
  account_link_required: "This Google account matches an existing BiletFlow account. Sign in with your password first, then link Google from your account.",
  google_authorization_denied: "Google sign-in was cancelled. You can try again whenever you’re ready.",
  google_identity_already_linked: "That Google account is linked to a different BiletFlow account.",
  google_not_configured: "Google sign-in is not configured for this environment.",
  google_unavailable: "Google sign-in is temporarily unavailable. Please try again.",
  invalid_oauth_state: "This Google sign-in expired or could not be verified. Please start again.",
  google_exchange_failed: "Google could not complete sign-in. Please try again.",
  suspended_account: "This account is unavailable. Contact support if you think this is a mistake.",
  permission_denied: "You don’t have permission to perform that action.",
  organization_not_found: "That organizer workspace is no longer available.",
  event_not_found: "That event is no longer available.",
  event_not_publishable: "This event cannot be published yet. Check its dates and ticket setup.",
  usable_ticket_type_required: "Add an available ticket type before publishing this event.",
  invalid_input: "Some details need attention. Review the form and try again.",
  invalid_filter_range: "The selected filter range is invalid.",
  rate_limited: "Too many requests. Wait a moment and try again.",
  database_unavailable: "The service is temporarily unavailable. Please try again shortly.",
};

const state = {
  page: "discover",
  categories: [],
  venues: [],
  organizations: [],
  organizationId: "",
  filters: { q: "", category_id: "" },
  requestId: 0,
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function dateLabel(value, options = { dateStyle: "medium", timeStyle: "short" }) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : new Intl.DateTimeFormat(undefined, options).format(date);
}

function failureMessage(code, status) {
  if (messages[code]) return messages[code];
  if (status === 403) return "You don’t have permission to do that.";
  if (status === 404) return "This item could not be found.";
  if (status === 409) return "This change conflicts with the current event setup.";
  if (status >= 500) return "The service is temporarily unavailable. Please try again shortly.";
  return "Something went wrong. Please try again.";
}

export function createLiveExperience({ root, getSession, onSignOut, onSessionExpired, onAccessToken, onProfileLoaded, notify }) {
  let refreshPromise;

  async function refreshAccessToken() {
    if (!refreshPromise) {
      refreshPromise = (async () => {
        let response;
        try {
          response = await fetch("/api/v1/auth/refresh", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
        } catch (error) {
          if (error instanceof TypeError) {
            throw new Error("Can’t reach BiletFlow to renew your session. Check your connection and try again.");
          }
          throw error;
        }
        if (response.status === 401) return null;
        const text = await response.text();
        let body = {};
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            body = {};
          }
        }
        if (!response.ok) {
          const code = body?.detail?.code || body?.code;
          throw new Error(failureMessage(code, response.status));
        }
        return body.access_token;
      })();
    }
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function api(path, options = {}) {
    const { accessToken } = getSession();
    const headers = new Headers(options.headers || {});
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");

    let response;
    try {
      response = await fetch(path, { ...options, headers, credentials: "include" });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error("Can’t reach BiletFlow right now. Check that the API is running and try again.");
      }
      throw error;
    }

    if (response.status === 401 && path !== "/api/v1/auth/refresh" && !options.__retried) {
      const refreshedToken = await refreshAccessToken();
      if (!refreshedToken) {
        onSessionExpired();
        throw new Error("Your session expired. Sign in again to continue.");
      }
      onAccessToken(refreshedToken);
      return api(path, { ...options, __retried: true });
    }

    const text = await response.text();
    let body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }
    if (!response.ok) {
      const code = body?.detail?.code || body?.code;
      throw new Error(failureMessage(code, response.status));
    }
    return body;
  }

  function render() {
    const { profile } = getSession();
    const name = profile?.display_name || "BiletFlow member";
    const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    const pageButtons = Object.entries(pageLabels).map(([page, label]) => `
      <button class="role-link ${state.page === page ? "active" : ""}" data-live-page="${page}" aria-current="${state.page === page ? "page" : "false"}">
        <span class="nav-glyph">${page === "discover" ? "D" : page === "organizer" ? "O" : "A"}</span>${label}
      </button>`).join("");

    root.innerHTML = `<div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#" aria-label="BiletFlow"><span class="brand-mark">b</span>BiletFlow</a>
        <p class="workspace-label">Your BiletFlow</p>
        <nav class="role-nav live-nav" aria-label="Main navigation">${pageButtons}</nav>
        <div class="sidebar-spacer"></div>
        <div class="preview-note"><strong>Connected workspace</strong>Your profile, events, and sessions are loaded from BiletFlow.</div>
        <div class="user-profile">
          <div class="avatar">${escapeHtml(initials)}</div>
          <div class="user-meta"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(profile?.email || "")}</span></div>
          <button class="logout-button" data-live-action="logout" title="Sign out">Sign out</button>
        </div>
      </aside>
      <main class="main-area">
        <header class="topbar">
          <div class="topbar-left"><span>BiletFlow</span><span aria-hidden="true">/</span><span class="crumb-current">${pageLabels[state.page]}</span></div>
          <div class="topbar-right"><span class="today">${escapeHtml(profile?.email || "")}</span><div class="avatar">${escapeHtml(initials)}</div></div>
        </header>
        <div id="live-page-content"><div class="loading-state" role="status"><span class="loading-spinner"></span>Loading ${pageLabels[state.page].toLowerCase()}…</div></div>
      </main>
    </div>`;
    void loadPage();
  }

  async function loadPage() {
    const requestId = ++state.requestId;
    const container = root.querySelector("#live-page-content");
    if (!container) return;
    container.innerHTML = `<div class="loading-state" role="status"><span class="loading-spinner"></span>Loading ${pageLabels[state.page].toLowerCase()}…</div>`;

    try {
      let markup;
      if (state.page === "discover") markup = await loadDiscovery();
      else if (state.page === "organizer") markup = await loadOrganizer();
      else markup = await loadAccount();
      if (requestId === state.requestId && root.querySelector("#live-page-content")) {
        root.querySelector("#live-page-content").innerHTML = markup;
      }
    } catch (error) {
      if (requestId !== state.requestId) return;
      const current = root.querySelector("#live-page-content");
      if (current) {
        current.innerHTML = `<section class="panel live-error" role="alert"><strong>We couldn’t load ${escapeHtml(pageLabels[state.page].toLowerCase())}.</strong><p>${escapeHtml(error.message)}</p><button class="subtle-button" data-live-action="retry">Try again</button></section>`;
      }
    }
  }

  async function loadDiscovery() {
    const params = new URLSearchParams({ limit: "50" });
    if (state.filters.q) params.set("q", state.filters.q);
    if (state.filters.category_id) params.set("category_id", state.filters.category_id);
    const [events, categories, venues] = await Promise.all([
      api(`/api/v1/events?${params}`),
      api("/api/v1/categories"),
      api("/api/v1/venues"),
    ]);
    state.categories = categories;
    state.venues = venues;
    const venueById = new Map(venues.map((venue) => [venue.id, venue]));
    const categoryById = new Map(categories.map((category) => [category.id, category]));

    const cards = events.length ? events.map((event, index) => {
      const venue = venueById.get(event.venue_id);
      const category = categoryById.get(event.category_id);
      const categoryName = category?.name_en || "COMMUNITY";
      return `<article class="discover-card">
        <div class="live-art live-art-${index % 4}" aria-hidden="true"><span>${escapeHtml(categoryName.slice(0, 1))}</span></div>
        <div class="discover-copy">
          <p class="eyebrow">${escapeHtml(categoryName)}</p>
          <h3>${escapeHtml(event.title)}</h3>
          <p>${escapeHtml(dateLabel(event.starts_at))} · ${escapeHtml(venue ? `${venue.name} · ${venue.city}` : "Venue details unavailable")}</p>
          <div class="discover-foot"><span class="price">${event.visibility === "public" ? "Tickets available" : "Event"}</span><button class="text-button" data-live-action="event-details" data-event-id="${escapeHtml(event.id)}">View event →</button></div>
        </div>
      </article>`;
    }).join("") : `<div class="empty-state wide-empty">No events match those filters yet. Try another search or check back soon.</div>`;

    return `<div class="page-heading">
      <div><p class="eyebrow">Your city, in good company</p><h1 class="serif">Find your next moment.</h1><p>Discover what’s happening around you, from the people bringing it to life.</p></div>
    </div>
    <form class="panel live-filters" data-live-form="discovery">
      <label class="search-box"><span aria-hidden="true">⌕</span><input name="q" value="${escapeHtml(state.filters.q)}" placeholder="Search event titles" aria-label="Search events"></label>
      <label class="field compact-field"><span>Category</span><select name="category_id"><option value="">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category.id)}" ${state.filters.category_id === category.id ? "selected" : ""}>${escapeHtml(category.name_en)}</option>`).join("")}</select></label>
      <button class="primary-button" type="submit">Search events</button>
    </form>
    <div class="event-cards live-event-cards" id="live-events">${cards}</div>
    <section class="panel live-detail" id="event-detail" hidden></section>`;
  }

  async function loadOrganizer() {
    const [organizations, categories, venues] = await Promise.all([
      api("/api/v1/organizations"),
      api("/api/v1/categories"),
      api("/api/v1/venues"),
    ]);
    state.organizations = organizations;
    state.categories = categories;
    state.venues = venues;
    if (!organizations.some((org) => org.id === state.organizationId)) {
      state.organizationId = organizations[0]?.id || "";
    }
    const organization = organizations.find((org) => org.id === state.organizationId);
    const events = organization
      ? await api(`/api/v1/organizations/${encodeURIComponent(organization.id)}/events`)
      : [];

    const heading = `<div class="page-heading">
      <div><p class="eyebrow">Organizer workspace</p><h1 class="serif">Bring people together.</h1><p>Create an organization, prepare events, and publish your next gathering.</p></div>
    </div>`;
    const createOrganization = `<section class="panel live-form-panel">
      <div class="panel-heading"><h2>Create your organizer workspace</h2></div>
      <p class="form-intro">Set up an organization before creating events.</p>
      <form class="live-form" data-live-form="create-organization">
        <label class="field"><span>Organization name</span><input name="name" required maxlength="200" placeholder="e.g. Northline Collective"></label>
        <label class="field"><span>Contact email</span><input name="contact_email" type="email" value="${escapeHtml(getSession().profile?.email || "")}" required maxlength="254"></label>
        <label class="field"><span>Contact phone <small>Optional</small></span><input name="contact_phone" maxlength="32" placeholder="+7 …"></label>
        <p class="form-message" data-form-message></p><button class="primary-button" type="submit">Create workspace</button>
      </form>
    </section>`;

    const organizationSelect = organizations.length > 1
      ? `<label class="field compact-field org-picker"><span>Workspace</span><select data-live-change="organization">${organizations.map((org) => `<option value="${escapeHtml(org.id)}" ${org.id === state.organizationId ? "selected" : ""}>${escapeHtml(org.name)}</option>`).join("")}</select></label>`
      : `<div class="org-heading"><strong>${escapeHtml(organization?.name || "")}</strong><span>${escapeHtml(organization?.contact_email || "")}</span></div>`;
    const eventRows = events.length ? events.map((event) => {
      const venue = venues.find((item) => item.id === event.venue_id);
      const published = event.publication_state === "published";
      const canPublish = event.publication_state !== "cancelled";
      return `<div class="managed-event">
        <div class="event-date"><b>${escapeHtml(dateLabel(event.starts_at, { day: "2-digit" }))}</b><span>${escapeHtml(dateLabel(event.starts_at, { month: "short" }).toUpperCase())}</span></div>
        <div class="event-copy"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(venue ? `${venue.name} · ${venue.city}` : "Venue unavailable")} · ${escapeHtml(dateLabel(event.starts_at))}</span></div>
        <span class="status ${published ? "" : "neutral"}">${escapeHtml(event.publication_state)}</span>
        ${canPublish ? `<button class="subtle-button compact-action" data-live-action="${published ? "unpublish-event" : "publish-event"}" data-event-id="${escapeHtml(event.id)}">${published ? "Unpublish" : "Publish"}</button>` : ""}
      </div>`;
    }).join("") : `<div class="empty-state">No events in this workspace yet. Create a draft to get started.</div>`;
    const eventsPanel = `<section class="panel live-form-panel">
      <div class="panel-heading"><h2>Your events</h2><span class="status neutral">${events.length} total</span></div>
      <div class="managed-event-list">${eventRows}</div>
    </section>`;
    const createEvent = `<section class="panel live-form-panel">
      <div class="panel-heading"><h2>Create an event draft</h2></div>
      <p class="form-intro">A free RSVP ticket is added automatically so a valid event can be published.</p>
      <form class="live-form event-create-form" data-live-form="create-event">
        <label class="field"><span>Event title</span><input name="title" required maxlength="200" placeholder="Give your event a name"></label>
        <label class="field"><span>Description</span><textarea name="description" rows="3" maxlength="20000" placeholder="What should guests know?"></textarea></label>
        <div class="form-grid">
          <label class="field"><span>Category</span><select name="category_id" required><option value="">Choose category</option>${categories.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name_en)}</option>`).join("")}</select></label>
          <label class="field"><span>Venue</span><select name="venue_id" required><option value="">Choose venue</option>${venues.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.city)}</option>`).join("")}</select></label>
        </div>
        <label class="field"><span>Capacity</span><input name="capacity" type="number" min="1" max="100000" value="50" required></label>
        <div class="form-grid">
          <label class="field"><span>Starts</span><input name="starts_at" type="datetime-local" required></label>
          <label class="field"><span>Ends</span><input name="ends_at" type="datetime-local" required></label>
        </div>
        <p class="form-message" data-form-message></p><button class="primary-button" type="submit">Create event draft</button>
      </form>
    </section>`;

    return heading + (organization
      ? `<div class="org-toolbar">${organizationSelect}</div><div class="content-grid organizer-live-grid"><div class="organizer-live-column">${eventsPanel}${createEvent}</div><aside class="panel organizer-note"><p class="eyebrow">A good first step</p><h2>Make the details easy to find.</h2><p>Choose a venue and category, set your event dates, then publish when your listing is ready for guests.</p></aside></div>`
      : `<div class="content-grid"><section>${createOrganization}</section><aside class="panel organizer-note"><p class="eyebrow">Organizer workspace</p><h2>Your events start here.</h2><p>Create your organization to manage event listings and bring your community together.</p></aside></div>`);
  }

  async function loadAccount() {
    const [profile, sessions] = await Promise.all([
      api("/api/v1/me"),
      api("/api/v1/auth/sessions?limit=50"),
    ]);
    onProfileLoaded(profile);
    const sessionId = getSessionId(getSession().accessToken);
    const now = Date.now();
    const sessionRows = sessions.length ? sessions.map((session) => {
      const current = session.id === sessionId;
      const revoked = Boolean(session.revoked_at);
      const expired = new Date(session.expires_at).getTime() <= now;
      const active = !revoked && !expired;
      const label = current ? "This device" : session.client_kind === "web" ? "Web browser" : "Scanner";
      return `<article class="session-row">
        <div class="session-icon" aria-hidden="true">${session.client_kind === "web" ? "W" : "S"}</div>
        <div class="session-info"><strong>${label}${current ? ' <span class="status">Current</span>' : ""}</strong><span>Started ${escapeHtml(dateLabel(session.created_at))} · Last active ${escapeHtml(session.last_seen_at ? dateLabel(session.last_seen_at) : "Not yet")}</span><small>${revoked ? `Revoked ${escapeHtml(dateLabel(session.revoked_at))}` : expired ? `Expired ${escapeHtml(dateLabel(session.expires_at))}` : `Expires ${escapeHtml(dateLabel(session.expires_at))}`}</small></div>
        ${active && !current ? `<button class="subtle-button revoke-session" data-live-action="revoke-session" data-session-id="${escapeHtml(session.id)}">Revoke</button>` : ""}
      </article>`;
    }).join("") : `<div class="empty-state">No sessions were found for this account.</div>`;
    const verified = profile.email_verified_at ? "Email verified" : "Email not verified";
    return `    <div class="page-heading">
      <div><p class="eyebrow">Your account</p><h1 class="serif">Profile & sessions.</h1><p>Review your profile and keep track of where you’re signed in.</p></div>
    <div class="heading-actions"><button class="subtle-button" data-live-action="logout">Sign out</button><button class="subtle-button danger-button" data-live-action="logout-all">Sign out everywhere</button></div>
    </div>
    <div class="content-grid account-grid">
      <section class="panel live-form-panel">
        <div class="panel-heading"><h2>Your profile</h2><span class="status">${verified}</span></div>
        <p class="account-email">${escapeHtml(profile.email)}</p>
        <form class="live-form" data-live-form="update-profile">
          <label class="field"><span>Display name</span><input name="display_name" required minlength="1" maxlength="100" value="${escapeHtml(profile.display_name)}"></label>
          <label class="field"><span>Language</span><select name="locale">${[["en", "English"], ["kk", "Қазақша"], ["ru", "Русский"]].map(([code, label]) => `<option value="${code}" ${profile.locale === code ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <p class="form-message" data-form-message></p><button class="primary-button" type="submit">Save profile</button>
        </form>
      </section>
      <section class="panel session-panel">
        <div class="panel-heading"><div><h2>Signed-in sessions</h2><p class="panel-subtitle">Revoke a device you no longer use.</p></div><button class="text-button" data-live-action="refresh-sessions">Refresh</button></div>
        <div class="session-list">${sessionRows}</div>
      </section>
    </div>`;
  }

  function getSessionId(token) {
    try {
      const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
      return claims.sid || "";
    } catch {
      return "";
    }
  }

  function showFormMessage(form, message, success = false) {
    const output = form.querySelector("[data-form-message]");
    if (!output) return;
    output.textContent = message;
    output.classList.toggle("success", success);
  }

  async function handleSubmit(form) {
    const kind = form.dataset.liveForm;
    if (!kind) return false;
    return withBusyForm(form, async () => {
      if (kind === "discovery") {
        const data = new FormData(form);
        state.filters.q = String(data.get("q") || "").trim();
        state.filters.category_id = String(data.get("category_id") || "");
        await loadPage();
        return;
      }
      if (kind === "create-organization") {
        const data = new FormData(form);
        const org = await api("/api/v1/organizations", {
          method: "POST",
          body: JSON.stringify({
            name: String(data.get("name") || "").trim(),
            contact_email: String(data.get("contact_email") || "").trim(),
            contact_phone: String(data.get("contact_phone") || "").trim() || null,
          }),
        });
        state.organizationId = org.id;
        notify("Organizer workspace created.");
        await loadPage();
        return;
      }
      if (kind === "create-event") {
        const data = new FormData(form);
        const startsAt = new Date(String(data.get("starts_at") || ""));
        const endsAt = new Date(String(data.get("ends_at") || ""));
        if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt || startsAt <= new Date()) {
          showFormMessage(form, "Choose a future start time and an end time after it.");
          return;
        }
        const starts = startsAt.toISOString();
        const ends = endsAt.toISOString();
        const capacity = Number(data.get("capacity"));
        const organization = state.organizations.find((item) => item.id === state.organizationId);
        if (!organization) throw new Error("Choose an active organizer workspace and try again.");
        const event = await api(`/api/v1/organizations/${encodeURIComponent(organization.id)}/events`, {
          method: "POST",
          body: JSON.stringify({
            title: String(data.get("title") || "").trim(),
            description: String(data.get("description") || ""),
            category_id: String(data.get("category_id") || ""),
            venue_id: String(data.get("venue_id") || ""),
            visibility: "public",
            seating_mode: "general",
            capacity,
            starts_at: starts,
            ends_at: ends,
            time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Almaty",
            registration_opens_at: new Date().toISOString(),
            registration_closes_at: starts,
            admission_opens_at: starts,
            admission_closes_at: ends,
            refund_allowed: false,
            refund_cutoff_at: null,
          }),
        });
        try {
          await api(`/api/v1/events/${encodeURIComponent(event.id)}/ticket-types`, {
            method: "POST",
            body: JSON.stringify({
              name: "General admission",
              description: "",
              kind: "free",
              price_minor: 0,
              quantity_limit: capacity,
              per_order_limit: Math.min(5, capacity),
              sales_open_at: new Date().toISOString(),
              sales_close_at: starts,
              is_hidden: false,
            }),
          });
          notify("Event draft created with a free RSVP ticket.");
        } catch (error) {
          notify(`The event draft was saved, but its RSVP ticket could not be created: ${error.message}`);
        }
        await loadPage();
        return;
      }
      if (kind === "update-profile") {
        const data = new FormData(form);
        const profile = await api("/api/v1/me", {
          method: "PATCH",
          body: JSON.stringify({
            display_name: String(data.get("display_name") || "").trim(),
            locale: String(data.get("locale") || "en"),
          }),
        });
        onProfileLoaded(profile);
        notify("Profile updated.");
        render();
      }
    });
  }

  async function withBusyForm(form, action) {
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    const output = form.querySelector("[data-form-message]");
    if (output) {
      output.textContent = "";
      output.classList.remove("success");
    }
    try {
      await action();
    } catch (error) {
      showFormMessage(form, error.message);
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }

  async function handleClick(target) {
    const page = target.closest("[data-live-page]")?.dataset.livePage;
    if (page && pageLabels[page]) {
      state.page = page;
      render();
      return true;
    }

    const action = target.closest("[data-live-action]");
    if (!action) return false;
    const kind = action.dataset.liveAction;
    if (kind === "retry" || kind === "refresh-sessions") {
      await loadPage();
    } else if (kind === "logout") {
      action.disabled = true;
      try {
        await api("/api/v1/auth/logout", { method: "POST" });
        onSignOut("");
      } catch (error) {
        if (!getSession().accessToken) return true;
        notify(`Could not confirm sign-out: ${error.message}`);
        action.disabled = false;
      }
    } else if (kind === "logout-all") {
      if (!window.confirm("Sign out of every active BiletFlow session? This device will also be signed out.")) return true;
      action.disabled = true;
      try {
        await api("/api/v1/auth/logout-all", { method: "POST" });
        onSignOut("");
      } catch (error) {
        if (!getSession().accessToken) return true;
        notify(`Could not sign out everywhere: ${error.message}`);
        action.disabled = false;
      }
    } else if (kind === "revoke-session") {
      const id = action.dataset.sessionId;
      action.disabled = true;
      try {
        await api(`/api/v1/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
        notify("Session revoked.");
        await loadPage();
      } catch (error) {
        notify(error.message);
        action.disabled = false;
      }
    } else if (kind === "publish-event" || kind === "unpublish-event") {
      action.disabled = true;
      const operation = kind === "publish-event" ? "publish" : "unpublish";
      try {
        await api(`/api/v1/events/${encodeURIComponent(action.dataset.eventId)}/${operation}`, { method: "POST" });
        notify(operation === "publish" ? "Event published." : "Event unpublished.");
        await loadPage();
      } catch (error) {
        notify(error.message);
        action.disabled = false;
      }
    } else if (kind === "event-details") {
      const panel = root.querySelector("#event-detail");
      if (!panel) return true;
      panel.hidden = false;
      panel.innerHTML = `<div class="loading-state"><span class="loading-spinner"></span>Loading event details…</div>`;
      try {
        const id = action.dataset.eventId;
        const [event, tickets] = await Promise.all([
          api(`/api/v1/events/${encodeURIComponent(id)}`),
          api(`/api/v1/events/${encodeURIComponent(id)}/ticket-types`),
        ]);
        const venue = state.venues.find((item) => item.id === event.venue_id);
        const category = state.categories.find((item) => item.id === event.category_id);
        panel.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">${escapeHtml(category?.name_en || "EVENT")}</p><h2>${escapeHtml(event.title)}</h2></div><button class="text-button" data-live-action="close-event-details" aria-label="Close event details">Close</button></div>
          <p class="event-description">${escapeHtml(event.description || "More details will be shared by the organizer.")}</p>
          <p class="event-detail-meta">${escapeHtml(dateLabel(event.starts_at))} – ${escapeHtml(dateLabel(event.ends_at))}${venue ? ` · ${escapeHtml(venue.name)} · ${escapeHtml(venue.city)}` : ""}</p>
          <div class="ticket-options">${tickets.filter((ticket) => !ticket.is_hidden).map((ticket) => `<div class="ticket-option"><strong>${escapeHtml(ticket.name)}</strong><span>${ticket.price_minor === 0 ? "Free" : `₸${(ticket.price_minor / 100).toFixed(2)}`}</span></div>`).join("") || `<p class="empty-state">Ticket details are not available yet.</p>`}</div>`;
      } catch (error) {
        panel.innerHTML = `<div class="live-error" role="alert"><strong>We couldn’t load this event.</strong><p>${escapeHtml(error.message)}</p><button class="subtle-button" data-live-action="event-details" data-event-id="${escapeHtml(action.dataset.eventId)}">Try again</button></div>`;
      }
    } else if (kind === "close-event-details") {
      const panel = root.querySelector("#event-detail");
      if (panel) panel.hidden = true;
    }
    return true;
  }

  function handleChange(target) {
    if (target.matches('[data-live-change="organization"]')) {
      state.organizationId = target.value;
      void loadPage();
      return true;
    }
    return false;
  }

  return { render, handleClick, handleSubmit, handleChange };
}
