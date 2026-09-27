const roles = [
  { id: "attendee", label: "Attendee", glyph: "A", dot: "" },
  { id: "organizer", label: "Organizer", glyph: "O", dot: "organizer" },
  { id: "staff", label: "Event admin", glyph: "E", dot: "staff" },
  { id: "admin", label: "Platform admin", glyph: "P", dot: "admin" },
];

const events = [
  { title: "Almaty After Dark", category: "LIVE MUSIC", date: "18", month: "OCT", place: "Republic Palace · Almaty", price: "From ₸8,500", image: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=82" },
  { title: "Ideas That Move Us", category: "TALKS & IDEAS", date: "24", month: "OCT", place: "SmArt.Point · Almaty", price: "Free entry", image: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=900&q=82" },
];

const moderation = [
  { title: "Almaty Design Week", organizer: "Northline Collective", reason: "New organizer · paid sales activation", age: "Submitted 18 min ago" },
  { title: "Campus Sound Sessions", organizer: "NU Student Union", reason: "Event listing reported", age: "Submitted 42 min ago" },
  { title: "Founders' Table: Almaty", organizer: "Common Ground KZ", reason: "Payout details need review", age: "Submitted 1 hr ago" },
];

const state = { screen: "auth", mode: "login", role: "attendee", profile: null, accessToken: "", toastTimer: 0 };
const root = document.querySelector("#app");
const toast = document.querySelector("#toast");

function notify(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function authMarkup(message = "", success = false) {
  const registering = state.mode === "register";
  const title = registering ? "Create your account" : "Good to see you";
  return `
    <main class="auth-screen">
      <section class="auth-story" aria-label="BiletFlow introduction">
        <a class="brand" href="#" aria-label="BiletFlow home"><span class="brand-mark">b</span>BiletFlow</a>
        <div class="story-copy">
          <p class="eyebrow">A city is better together</p>
          <h1 class="serif">Make room for <em>what matters.</em></h1>
          <p>Find your people, bring an idea to life, and make the kind of memories that stay after the lights come up.</p>
          <div class="story-ticket"><div class="ticket-stamp">GOOD<br>THINGS<br>HAPPEN</div><div><strong>Your next story starts here.</strong><span>Discover · Gather · Belong</span></div></div>
        </div>
        <div class="auth-foot">Made for the moments that bring us closer · Kazakhstan</div>
      </section>
      <section class="auth-panel">
        <div class="auth-box">
          <p class="eyebrow">Welcome to BiletFlow</p>
          <h2>${title}</h2>
          <p class="auth-subtitle">${registering ? "Start discovering events and bringing people together." : "Sign in to pick up right where your plans left off."}</p>
          <div class="auth-tabs" role="tablist" aria-label="Account access">
            <button class="auth-tab ${!registering ? "active" : ""}" data-mode="login" role="tab" aria-selected="${!registering}">Sign in</button>
            <button class="auth-tab ${registering ? "active" : ""}" data-mode="register" role="tab" aria-selected="${registering}">Create account</button>
          </div>
          <form id="auth-form" novalidate>
            ${registering ? `<div class="field"><label for="display-name">Your name</label><input id="display-name" name="display_name" autocomplete="name" placeholder="e.g. Aida Sarsen" required maxlength="100"></div>` : ""}
            <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required maxlength="254"></div>
            <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${registering ? "new-password" : "current-password"}" placeholder="${registering ? "At least 12 characters" : "Enter your password"}" required maxlength="128" minlength="${registering ? "12" : "1"}"></div>
            ${registering ? `<p class="field-note">Use at least 12 characters. We’ll email you a verification link.</p>` : `<div class="auth-row"><span></span><button class="text-button" type="button" data-action="forgot">Forgot password?</button></div>`}
            <button class="primary-button full" id="submit-auth" type="submit">${registering ? "Create account" : "Sign in"}<span aria-hidden="true">→</span></button>
            <p class="auth-message ${success ? "success" : ""}" id="auth-message" role="status">${escapeHtml(message)}</p>
          </form>
          <div class="divider">OR EXPLORE A PREVIEW</div>
          <p class="demo-title">Open a role workspace without an account</p>
          <div class="demo-grid">${roles.map((role) => `<button class="demo-role" data-preview="${role.id}"><span class="role-dot ${role.dot}"></span>${role.label}</button>`).join("")}</div>
          <p class="auth-legal">By continuing, you agree to our Terms of Service and Privacy Policy. Demo workspaces use sample data and do not grant real permissions.</p>
        </div>
      </section>
    </main>`;
}

function roleNav() {
  return roles.map((role) => `<button class="role-link ${state.role === role.id ? "active" : ""}" data-role="${role.id}" aria-current="${state.role === role.id ? "page" : "false"}"><span class="nav-glyph">${role.glyph}</span>${role.label}</button>`).join("");
}

function shell(content) {
  const name = state.profile?.display_name || "Preview guest";
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const roleName = roles.find((role) => role.id === state.role)?.label;
  return `<div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#"><span class="brand-mark">b</span>BiletFlow</a>
      <p class="workspace-label">Switch workspace</p>
      <nav class="role-nav" aria-label="Role preview">${roleNav()}</nav>
      <div class="sidebar-spacer"></div>
      <div class="preview-note"><strong>${state.profile ? "Workspace preview" : "Preview mode"}</strong>Role pages are UI previews. Access control will follow your team’s role setup.</div>
      <div class="user-profile"><div class="avatar">${escapeHtml(initials)}</div><div class="user-meta"><strong>${escapeHtml(name)}</strong><span>${state.profile ? escapeHtml(state.profile.email) : `${roleName} workspace`}</span></div><button class="logout-button" data-action="logout" title="${state.profile ? "Sign out" : "Back to sign in"}">${state.profile ? "Sign out" : "Exit"}</button></div>
    </aside>
    <main class="main-area">
      <header class="topbar"><div class="topbar-left"><span>Workspace</span><span aria-hidden="true">/</span><span class="crumb-current">${roleName}</span></div><div class="topbar-right"><span class="today">Sunday, 27 September 2026</span><button class="icon-button" data-action="notifications" aria-label="Notifications" title="Notifications">♧</button><div class="avatar">${escapeHtml(initials)}</div></div></header>
      ${content}
    </main>
  </div>`;
}

function stats(items) {
  return `<div class="stat-grid">${items.map((item) => `<div class="stat-card"><span class="stat-label">${item.label}</span><strong class="stat-value">${item.value}</strong><span class="stat-foot ${item.positive ? "positive" : ""}">${item.foot}</span></div>`).join("")}</div>`;
}

function eventCard(event) {
  return `<article class="discover-card"><img class="discover-image" src="${event.image}" alt="Crowd gathered at an event" loading="lazy"><div class="discover-copy"><p class="eyebrow">${event.category}</p><h3>${event.title}</h3><p>${event.date} ${event.month} · ${event.place}</p><div class="discover-foot"><span class="price">${event.price}</span><button class="text-button" data-action="event" data-event="${event.title}">View event →</button></div></div></article>`;
}

function attendeePage() {
  const heading = `<div class="page-heading"><div><p class="eyebrow">Your city, in good company</p><h1 class="serif">Find your next moment.</h1><p>Little plans make the best stories. See what’s happening around you.</p></div><div class="heading-actions"><button class="subtle-button" data-action="calendar">＋ Add to calendar</button></div></div>`;
  return heading + `<div class="content-grid"><section><div class="search-box" style="margin-bottom:14px"><span>⌕</span><input id="event-search" placeholder="Search events, places, or people" aria-label="Search events"></div><div class="event-cards" id="event-cards">${events.map(eventCard).join("")}</div><div class="panel" style="margin-top:15px"><div class="panel-heading"><h2>Your upcoming plans</h2><button data-action="tickets">All tickets →</button></div><div class="event-list"><div class="event-row"><div class="event-date"><b>03</b><span>OCT</span></div><div class="event-copy"><strong>Sunday ceramics club</strong><span>Almaty Ceramic Studio · 11:00</span></div><span class="status">Ticket ready</span></div></div></div></section><aside class="panel promo-panel"><img class="promo-image" src="https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=800&q=80" alt="Friends meeting at a community event" loading="lazy"><div class="promo-copy"><p class="eyebrow">A note from your city</p><h2>Good things happen when we show up.</h2><p>Discover local gatherings, meet the people behind them, and find your kind of crowd.</p><button class="subtle-button" data-action="discover">Explore all events →</button></div></aside></div>`;
}

function organizerPage() {
  const heading = `<div class="page-heading"><div><p class="eyebrow">Your events, at a glance</p><h1 class="serif">Good morning, ${escapeHtml((state.profile?.display_name || "organizer").split(" ")[0])}.</h1><p>Here’s how your events are finding their people.</p></div><div class="heading-actions"><button class="primary-button" data-action="create-event">＋ Create event</button></div></div>`;
  return heading + stats([{ label: "TICKETS SOLD", value: "486", foot: "+12% from last week", positive: true }, { label: "DEMO REVENUE", value: "₸2.4M", foot: "Across 3 active events" }, { label: "CHECKED IN", value: "72%", foot: "For events in progress", positive: true }, { label: "CAMPAIGN SALES", value: "38", foot: "Across 4 campaigns" }]) + `<div class="content-grid"><section class="panel"><div class="panel-heading"><h2>Your events</h2><button data-action="all-events">View all →</button></div><div class="event-list"><div class="event-row"><div class="event-date"><b>18</b><span>OCT</span></div><div class="event-copy"><strong>Almaty After Dark</strong><span>Republic Palace · 240 / 320 tickets</span></div><span class="status">On sale</span></div><div class="event-row"><div class="event-date"><b>24</b><span>OCT</span></div><div class="event-copy"><strong>Ideas That Move Us</strong><span>SmArt.Point · 146 / 200 tickets</span></div><span class="status">On sale</span></div><div class="event-row"><div class="event-date"><b>02</b><span>NOV</span></div><div class="event-copy"><strong>Sunday ceramics club</strong><span>Almaty Ceramic Studio · 28 / 40 tickets</span></div><span class="status neutral">Draft</span></div></div></section><section class="panel"><div class="panel-heading"><h2>Sales this week</h2><button data-action="analytics">Details →</button></div><div class="chart" aria-label="Ticket sales trend over seven days">${[32, 47, 38, 66, 51, 83, 69].map((height, index) => `<div class="chart-column"><div class="chart-bar" style="height:${height}%"></div><span>${["M", "T", "W", "T", "F", "S", "S"][index]}</span></div>`).join("")}</div><p class="stat-foot positive">↑ 18% compared with last week</p></section></div>`;
}

function staffPage() {
  const heading = `<div class="page-heading"><div><p class="eyebrow">Doors open, let’s make it smooth</p><h1 class="serif">Check-in desk</h1><p>Choose your event, then scan or look up an attendee.</p></div><div class="heading-actions"><span class="status">Online · Synced</span></div></div>`;
  return heading + `<div class="checkin-hero"><section class="checkin-card"><p class="eyebrow">YOUR ASSIGNED EVENT</p><h2>Almaty After Dark</h2><p>Republic Palace · Today, doors at 18:30</p><button class="scan-button" data-action="scan">▦ &nbsp; Scan a ticket</button><div class="scan-result" id="scan-result">Valid ticket · Aigerim K. · General admission · Checked in just now.</div></section><section class="checkin-count"><span>Guests through the door</span><strong>184 <small style="font-family:inherit;font-size:16px;color:#939d95">/ 320</small></strong><small>57% of expected attendees</small></section></div><div class="content-grid"><section class="panel"><div class="panel-heading"><h2>Find an attendee</h2><span class="status neutral">Manual lookup</span></div><div class="search-box"><span>⌕</span><input id="attendee-search" placeholder="Name, email, or ticket ID" aria-label="Search attendees"></div><div class="event-list" id="attendee-results"><div class="event-row"><div class="avatar">AK</div><div class="event-copy"><strong>Aigerim Kassenova</strong><span>General admission · BF-29481</span></div><span class="status">Checked in</span></div><div class="event-row"><div class="avatar">TM</div><div class="event-copy"><strong Timur Mukanov</strong><span>Balcony · BF-29476</span></div><span class="status pending">Not arrived</span></div><div class="event-row"><div class="avatar">DS</div><div class="event-copy"><strong>Dana Sadyk</strong><span>General admission · BF-29451</span></div><span class="status pending">Not arrived</span></div></div></section><aside class="panel"><div class="panel-heading"><h2>Quick reminders</h2></div><div class="activity-list"><div class="activity-item"><span class="activity-mark">1</span><p>Check the event name before scanning. Tickets are valid for one event only.<time>Entry guidance</time></p></div><div class="activity-item"><span class="activity-mark">2</span><p>Already-used tickets appear with the time and station of the first scan.<time>Duplicate scans</time></p></div><div class="activity-item"><span class="activity-mark">3</span><p>Connection is active. Every check-in is syncing in real time.<time>Last sync · just now</time></p></div></div></aside></div>`;
}

function adminPage() {
  const heading = `<div class="page-heading"><div><p class="eyebrow">Platform operations</p><h1 class="serif">The oversight desk.</h1><p>Keep the marketplace clear, fair, and ready for good events.</p></div><div class="heading-actions"><button class="subtle-button" data-action="export">↓ Export report</button></div></div>`;
  return heading + stats([{ label: "EVENTS LIVE", value: "128", foot: "Across 6 cities" }, { label: "NEEDS REVIEW", value: String(moderation.length), foot: "2 reports · 1 activation", positive: false }, { label: "PAYMENT ISSUES", value: "7", foot: "3 need follow-up" }, { label: "OPEN SUPPORT", value: "14", foot: "Median reply · 22 min", positive: true }]) + `<div class="content-grid"><section class="panel"><div class="panel-heading"><h2>Review queue</h2><span class="status pending" id="queue-count">${moderation.length} awaiting review</span></div><div class="moderation-list" id="moderation-list">${moderation.map((item, index) => `<article class="moderation-row" data-moderation="${index}"><div><strong>${item.title}</strong><p>${item.reason} · ${item.organizer}</p><small>${item.age}</small></div><div class="review-actions"><button data-review="approve" data-index="${index}">Approve</button><button data-review="reject" data-index="${index}">Hold</button></div></article>`).join("")}</div></section><aside class="panel"><div class="panel-heading"><h2>Platform pulse</h2><span class="status">Healthy</span></div><div class="activity-list"><div class="activity-item"><span class="activity-mark">↗</span><p>Ticket sales are up 8% this week across the platform.<time>Marketplace · 09:42</time></p></div><div class="activity-item"><span class="activity-mark">!</span><p>Two events were flagged for review by attendees.<time>Trust & safety · 09:18</time></p></div><div class="activity-item"><span class="activity-mark">₸</span><p>All sandbox payment services are responding normally.<time>Payments · 08:57</time></p></div></div><button class="subtle-button" style="width:100%;margin-top:18px" data-action="support">Open support cases →</button></aside></div>`;
}

function render() {
  if (state.screen === "auth") {
    root.innerHTML = authMarkup(state.message || "", state.messageSuccess || false);
    return;
  }
  const pages = { attendee: attendeePage, organizer: organizerPage, staff: staffPage, admin: adminPage };
  root.innerHTML = shell(pages[state.role]());
}

function showDashboard(role, profile = null) {
  state.screen = "dashboard";
  state.role = role;
  state.profile = profile;
  render();
}

async function parseResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = body?.detail?.code || body?.code;
    const messages = {
      invalid_credentials: "That email and password don’t match.",
      email_not_verified: "Please verify your email before signing in.",
      invalid_input: "Check your details and try again.",
      rate_limited: "Too many attempts. Please wait a moment and try again.",
      database_unavailable: "The service is temporarily unavailable. Please try again shortly.",
    };
    throw new Error(messages[code] || "Something went wrong. Please check your details and try again.");
  }
  return body;
}

async function submitAuth(form) {
  const formData = new FormData(form);
  const registering = state.mode === "register";
  const payload = {
    email: String(formData.get("email") || "").trim(),
    password: String(formData.get("password") || ""),
    ...(registering ? { display_name: String(formData.get("display_name") || "").trim(), locale: "en" } : { client_kind: "web" }),
  };
  const button = form.querySelector("#submit-auth");
  const message = form.querySelector("#auth-message");
  button.disabled = true;
  button.textContent = registering ? "Creating account…" : "Signing in…";
  message.textContent = "";
  message.classList.remove("success");
  try {
    const path = registering ? "/api/v1/auth/register" : "/api/v1/auth/login";
    const result = await parseResponse(await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));
    if (registering) {
      message.textContent = "Account request received. Check your email for the verification link, then sign in.";
      message.classList.add("success");
    } else {
      state.accessToken = result.access_token;
      const profile = await parseResponse(await fetch("/api/v1/me", { headers: { Authorization: `Bearer ${state.accessToken}` } }));
      showDashboard("attendee", profile);
    }
  } catch (error) {
    message.textContent = error.message;
  } finally {
    if (document.body.contains(button)) {
      button.disabled = false;
      button.innerHTML = `${registering ? "Create account" : "Sign in"}<span aria-hidden="true">→</span>`;
    }
  }
}

root.addEventListener("click", async (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.matches("[data-mode]")) {
    state.mode = target.dataset.mode;
    state.message = "";
    render();
  } else if (target.matches("[data-preview]")) {
    state.profile = null;
    state.accessToken = "";
    showDashboard(target.dataset.preview);
  } else if (target.matches("[data-role]")) {
    showDashboard(target.dataset.role, state.profile);
  } else if (target.matches("[data-action='logout']")) {
    if (state.accessToken) {
      fetch("/api/v1/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${state.accessToken}` } }).catch(() => {});
    }
    state.accessToken = "";
    state.profile = null;
    state.screen = "auth";
    state.mode = "login";
    render();
  } else if (target.matches("[data-action='forgot']")) {
    const email = root.querySelector("#email").value.trim();
    if (!email) {
      root.querySelector("#auth-message").textContent = "Enter your email address first.";
      root.querySelector("#email").focus();
      return;
    }
    try {
      await parseResponse(await fetch("/api/v1/auth/password/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }));
      root.querySelector("#auth-message").textContent = "If the account is eligible, a password reset link will arrive by email.";
      root.querySelector("#auth-message").classList.add("success");
    } catch (error) {
      root.querySelector("#auth-message").textContent = error.message;
    }
  } else if (target.matches("[data-action='scan']")) {
    root.querySelector("#scan-result").classList.add("visible");
    target.textContent = "✓  Ticket verified";
    notify("Demo scan complete. No real ticket was changed.");
  } else if (target.matches("[data-review]")) {
    const action = target.dataset.review === "approve" ? "approved" : "placed on hold";
    root.querySelector(`[data-moderation="${target.dataset.index}"]`)?.remove();
    const count = root.querySelectorAll("[data-moderation]").length;
    root.querySelector("#queue-count").textContent = count ? `${count} awaiting review` : "Queue clear";
    notify(`Demo action: event ${action}.`);
  } else if (target.matches("[data-action]")) {
    const messages = {
      event: `${target.dataset.event} event preview selected.`, tickets: "Your ticket list is ready for the account integration.",
      calendar: "Calendar export will be available with event details.", discover: "You’re viewing the latest local event picks.",
      "create-event": "New event draft flow is ready to connect.", "all-events": "Showing all organizer events.",
      analytics: "Detailed analytics view selected.", notifications: "You’re all caught up on notifications.",
      export: "Report export is a demo action.", support: "Support case inbox selected.",
    };
    if (messages[target.dataset.action]) notify(messages[target.dataset.action]);
  }
});

root.addEventListener("submit", (event) => {
  if (event.target.id === "auth-form") {
    event.preventDefault();
    submitAuth(event.target);
  }
});

root.addEventListener("input", (event) => {
  if (event.target.id === "event-search") {
    const query = event.target.value.trim().toLowerCase();
    root.querySelectorAll(".discover-card").forEach((card) => {
      card.hidden = !card.textContent.toLowerCase().includes(query);
    });
  }
  if (event.target.id === "attendee-search") {
    const query = event.target.value.trim().toLowerCase();
    root.querySelectorAll("#attendee-results .event-row").forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(query);
    });
  }
});

render();