import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { listAttendees } from "../api/checkout";
import {
  assignStaff,
  cancelEvent,
  createTicketType,
  duplicateEvent,
  getEvent,
  listCategories,
  listHistory,
  listMembers,
  listStaff,
  listTicketTypes,
  listVenues,
  publishEvent,
  revokeStaff,
  unpublishEvent,
  updateEvent,
  updateTicketType,
} from "../api/catalog";
import { describeError } from "../api/errors";
import { EVENT_CAPABILITIES, type Category, type EventCapability, type EventInput, type EventView, type TicketType, type TicketTypeInput, type Venue } from "../api/types";
import { EventForm } from "../components/EventForm";
import { EmptyState, ErrorPanel, FormMessage, Loading } from "../components/Feedback";
import { TicketTypeForm } from "../components/TicketTypeForm";
import { useToast } from "../components/Toast";
import { useRequest } from "../hooks/useRequest";
import { dateLabel, priceLabel, seatLabel, statusLabel } from "../utils/format";

type Tab = "details" | "tickets" | "attendees" | "staff" | "history";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "details", label: "Details" },
  { id: "tickets", label: "Ticket types" },
  { id: "attendees", label: "Attendees" },
  { id: "staff", label: "Staff" },
  { id: "history", label: "History" },
];

export function OrganizerEventPage() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);

  const page = useRequest(
    async () => {
      const [event, categories, venues] = await Promise.all([getEvent(eventId), listCategories(), listVenues()]);
      return { event, categories, venues };
    },
    [eventId],
  );

  if (page.loading) return <Loading label="Loading event…" />;
  if (page.error || !page.data) {
    return <ErrorPanel title="We couldn’t load this event." message={page.error ?? "Unknown error"} onRetry={page.reload} />;
  }
  const { event, categories, venues } = page.data;
  const venue = venues.find((item) => item.id === event.venue_id);
  const published = event.publication_state === "published";
  const cancelled = event.publication_state === "cancelled";

  const act = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      notify(done);
      page.reload();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel this event? This cannot be undone.")) return;
    await act(() => cancelEvent(event.id), "Event cancelled.");
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      const copy = await duplicateEvent(event.id);
      notify("Draft copied. Adjust its dates before publishing.");
      navigate(`/organizer/events/${encodeURIComponent(copy.id)}`);
      setTab("details");
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="manage-page">
      <Link className="back-link" to="/organizer">
        ← Organizer workspace
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            Manage event · {statusLabel(event.time_status)}
            {event.moderation_state !== "normal" ? " · suspended by moderation" : ""}
          </p>
          <h1 className="serif">{event.title}</h1>
          <p>
            {dateLabel(event.starts_at)} – {dateLabel(event.ends_at)}
            {venue ? ` · ${venue.name} · ${venue.city}` : ""}
          </p>
        </div>
        <div className="heading-actions">
          <span className={`status ${published ? "" : cancelled ? "blocked" : "neutral"}`}>{statusLabel(event.publication_state)}</span>
          <Link className="subtle-button" to={`/events/${encodeURIComponent(event.id)}`}>
            Public page
          </Link>
          {!cancelled ? (
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => void act(() => (published ? unpublishEvent(event.id) : publishEvent(event.id)), published ? "Event unpublished." : "Event published.")}
            >
              {published ? "Unpublish" : "Publish"}
            </button>
          ) : null}
          <button className="subtle-button" type="button" disabled={busy} onClick={() => void duplicate()}>
            Duplicate
          </button>
          {!cancelled ? (
            <button className="subtle-button danger-button" type="button" disabled={busy} onClick={() => void cancel()}>
              Cancel event
            </button>
          ) : null}
        </div>
      </div>
      <nav className="tabs" aria-label="Event sections">
        {TABS.map((item) => (
          <button key={item.id} className={`tab ${tab === item.id ? "active" : ""}`} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "details" ? <DetailsPanel key={event.updated_at} event={event} categories={categories} venues={venues} onSaved={page.reload} /> : null}
      {tab === "tickets" ? <TicketTypesPanel event={event} /> : null}
      {tab === "attendees" ? <AttendeesPanel event={event} /> : null}
      {tab === "staff" ? <StaffPanel event={event} /> : null}
      {tab === "history" ? <HistoryPanel event={event} /> : null}
    </div>
  );
}

function DetailsPanel({ event, categories, venues, onSaved }: { event: EventView; categories: Category[]; venues: Venue[]; onSaved: () => void }) {
  const { notify } = useToast();
  const [state, setState] = useState({ busy: false, message: "", success: false });

  const save = async (input: EventInput) => {
    setState({ busy: true, message: "", success: false });
    try {
      await updateEvent(event.id, input);
      notify("Event saved.");
      setState({ busy: false, message: "Saved.", success: true });
      onSaved();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure), success: false });
    }
  };

  return (
    <section className="panel live-form-panel">
      <div className="panel-heading">
        <h2>Event details</h2>
        <span className="status neutral">{event.seating_mode === "assigned" ? "Assigned seating" : "General admission"}</span>
      </div>
      <p className="form-intro">Saving replaces the whole configuration. Published events must stay publishable.</p>
      <EventForm
        initial={event}
        categories={categories}
        venues={venues}
        submitLabel="Save changes"
        busy={state.busy}
        message={state.message}
        success={state.success}
        onSubmit={save}
        onInvalid={(error) => setState({ busy: false, message: error, success: false })}
      />
    </section>
  );
}

function TicketTypesPanel({ event }: { event: EventView }) {
  const { notify } = useToast();
  const types = useRequest(() => listTicketTypes(event.id), [event.id]);
  const [editingId, setEditingId] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });

  const create = async (input: TicketTypeInput) => {
    setState({ busy: true, message: "" });
    try {
      await createTicketType(event.id, input);
      notify("Ticket type added.");
      setState({ busy: false, message: "" });
      types.reload();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  const update = async (type: TicketType, input: TicketTypeInput) => {
    setState({ busy: true, message: "" });
    try {
      await updateTicketType(event.id, type.id, input);
      notify("Ticket type saved.");
      setState({ busy: false, message: "" });
      setEditingId("");
      types.reload();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  return (
    <div className="organizer-live-column">
      <section className="panel live-form-panel">
        <div className="panel-heading">
          <h2>Ticket types</h2>
          <span className="status neutral">{types.data?.length ?? 0} configured</span>
        </div>
        {types.loading ? <Loading label="Loading ticket types…" /> : null}
        {types.error ? <ErrorPanel title="We couldn’t load ticket types." message={types.error} onRetry={types.reload} /> : null}
        {types.data ? (
          <div className="managed-event-list">
            {types.data.length === 0 ? <EmptyState>No ticket types yet. Add one below so the event can be published.</EmptyState> : null}
            {types.data.map((type) => (
              <div className="ticket-type-row" key={type.id}>
                <div className="managed-event managed-event-wide">
                  <div className="session-icon" aria-hidden="true">
                    {type.kind === "paid" ? "₸" : "F"}
                  </div>
                  <div className="event-copy">
                    <strong>
                      {type.name} · {priceLabel(type.price_minor)}
                    </strong>
                    <span>
                      {type.quantity_limit} available · up to {type.per_order_limit} per order · sales {dateLabel(type.sales_open_at)} – {dateLabel(type.sales_close_at)}
                    </span>
                  </div>
                  <span className={`status ${type.is_hidden ? "neutral" : ""}`}>{type.is_hidden ? "Hidden" : "Visible"}</span>
                  <div className="row-actions">
                    <button className="subtle-button compact-action" type="button" onClick={() => setEditingId(editingId === type.id ? "" : type.id)}>
                      {editingId === type.id ? "Close" : "Edit"}
                    </button>
                  </div>
                </div>
                {editingId === type.id ? (
                  <div className="inline-form">
                    <TicketTypeForm
                      key={type.id}
                      event={event}
                      initial={type}
                      submitLabel="Save ticket type"
                      busy={state.busy}
                      message={state.message}
                      onSubmit={(input) => update(type, input)}
                      onInvalid={(error) => setState({ busy: false, message: error })}
                      onCancel={() => setEditingId("")}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section className="panel live-form-panel">
        <div className="panel-heading">
          <h2>Add a ticket type</h2>
        </div>
        <TicketTypeForm
          event={event}
          submitLabel="Add ticket type"
          busy={state.busy}
          message={editingId ? "" : state.message}
          onSubmit={create}
          onInvalid={(error) => setState({ busy: false, message: error })}
        />
      </section>
    </div>
  );
}

function AttendeesPanel({ event }: { event: EventView }) {
  const attendees = useRequest(() => listAttendees(event.id), [event.id]);
  const admitted = attendees.data?.filter((row) => row.status === "checked_in").length ?? 0;

  return (
    <section className="panel live-form-panel">
      <div className="panel-heading">
        <div>
          <h2>Attendees</h2>
          <p className="panel-subtitle">Issued tickets for this event. Check-ins arrive from the scanner app.</p>
        </div>
        <span className="status neutral">
          {attendees.data?.length ?? 0} issued · {admitted} checked in
        </span>
      </div>
      {attendees.loading ? <Loading label="Loading attendees…" /> : null}
      {attendees.error ? <ErrorPanel title="We couldn’t load attendees." message={attendees.error} onRetry={attendees.reload} /> : null}
      {attendees.data ? (
        attendees.data.length === 0 ? (
          <EmptyState>No tickets issued yet.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Ticket</th>
                  <th>Seat</th>
                  <th>Status</th>
                  <th>Claimed</th>
                  <th>Issued</th>
                </tr>
              </thead>
              <tbody>
                {attendees.data.map((row) => (
                  <tr key={row.ticket_id}>
                    <td>{row.recipient_name}</td>
                    <td>{row.recipient_email}</td>
                    <td>{row.ticket_type_name}</td>
                    <td>{row.seat_snapshot ? seatLabel(row.seat_snapshot) : "—"}</td>
                    <td>
                      <span className={`status ${row.status === "valid" ? "" : row.status === "checked_in" ? "neutral" : "blocked"}`}>{statusLabel(row.status)}</span>
                    </td>
                    <td>{row.claimed ? "Yes" : "Not yet"}</td>
                    <td>{dateLabel(row.issued_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </section>
  );
}

function StaffPanel({ event }: { event: EventView }) {
  const { notify } = useToast();
  const [state, setState] = useState({ busy: false, message: "" });
  const [memberId, setMemberId] = useState("");
  const [capabilities, setCapabilities] = useState<EventCapability[]>(["scan"]);
  const staff = useRequest(
    async () => {
      const [assignments, members] = await Promise.all([
        listStaff(event.id),
        listMembers(event.organization_id).catch(() => []),
      ]);
      return { assignments: assignments.filter((row) => !row.revoked_at), members };
    },
    [event.id, event.organization_id],
  );

  const memberLabel = (id: string) => {
    const member = staff.data?.members.find((row) => row.id === id);
    return member ? `${member.display_name} · ${member.email}` : `Member ${id.slice(0, 8)}`;
  };

  const toggle = (capability: EventCapability) =>
    setCapabilities((current) => (current.includes(capability) ? current.filter((item) => item !== capability) : [...current, capability]));

  const assign = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!memberId) {
      setState({ busy: false, message: "Choose a team member." });
      return;
    }
    if (capabilities.length === 0) {
      setState({ busy: false, message: "Choose at least one capability." });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      await assignStaff(event.id, memberId, capabilities);
      notify("Staff assignment saved.");
      setState({ busy: false, message: "" });
      staff.reload();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  const revoke = async (staffId: string) => {
    if (!window.confirm("Remove this staff assignment?")) return;
    try {
      await revokeStaff(event.id, staffId);
      notify("Assignment removed.");
      staff.reload();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  const assignable = staff.data?.members.filter((member) => member.status === "active" && !member.revoked_at) ?? [];

  return (
    <div className="organizer-live-column">
      <section className="panel live-form-panel">
        <div className="panel-heading">
          <div>
            <h2>Event staff</h2>
            <p className="panel-subtitle">Members with the “Scan tickets” capability see this event in the mobile scanner app.</p>
          </div>
        </div>
        {staff.loading ? <Loading label="Loading staff…" /> : null}
        {staff.error ? <ErrorPanel title="We couldn’t load staff." message={staff.error} onRetry={staff.reload} /> : null}
        {staff.data ? (
          staff.data.assignments.length === 0 ? (
            <EmptyState>No staff assigned yet. The workspace owner can always scan and manage this event.</EmptyState>
          ) : (
            <div className="session-list">
              {staff.data.assignments.map((row) => (
                <article className="session-row" key={row.id}>
                  <div className="session-icon" aria-hidden="true">
                    S
                  </div>
                  <div className="session-info">
                    <strong>{memberLabel(row.member_id)}</strong>
                    <span>{row.capabilities.map((capability) => EVENT_CAPABILITIES.find((item) => item.id === capability)?.label ?? capability).join(", ")}</span>
                    <small>Assigned {dateLabel(row.created_at)}</small>
                  </div>
                  <button className="subtle-button revoke-session" type="button" onClick={() => void revoke(row.id)}>
                    Remove
                  </button>
                </article>
              ))}
            </div>
          )
        ) : null}
      </section>
      <section className="panel live-form-panel">
        <div className="panel-heading">
          <h2>Assign a team member</h2>
        </div>
        {assignable.length === 0 ? (
          <p className="form-intro">
            No assignable team members. Invite people from the <Link to="/organizer">organizer workspace</Link> first; they must accept the invitation before they can be assigned.
          </p>
        ) : null}
        <form className="live-form" onSubmit={(formEvent) => void assign(formEvent)}>
          <label className="field">
            <span>Team member</span>
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
              <option value="">Choose a member</option>
              {assignable.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name} · {member.email}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="capability-grid">
            <legend>Capabilities</legend>
            {EVENT_CAPABILITIES.map((capability) => (
              <label className="capability" key={capability.id}>
                <input type="checkbox" checked={capabilities.includes(capability.id)} onChange={() => toggle(capability.id)} />
                <span>
                  <strong>{capability.label}</strong>
                  <small>{capability.hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="form-intro">Assigning the same member again replaces their capabilities for this event.</p>
          <FormMessage message={state.message} />
          <button className="primary-button" type="submit" disabled={state.busy || assignable.length === 0}>
            Save assignment
          </button>
        </form>
      </section>
    </div>
  );
}

function HistoryPanel({ event }: { event: EventView }) {
  const history = useRequest(() => listHistory(event.id), [event.id]);

  return (
    <section className="panel live-form-panel">
      <div className="panel-heading">
        <div>
          <h2>Activity history</h2>
          <p className="panel-subtitle">Immutable record of changes, publication, staffing and admissions.</p>
        </div>
        <button className="text-button" type="button" onClick={history.reload}>
          Refresh
        </button>
      </div>
      {history.loading ? <Loading label="Loading history…" /> : null}
      {history.error ? <ErrorPanel title="We couldn’t load the history." message={history.error} onRetry={history.reload} /> : null}
      {history.data ? (
        history.data.length === 0 ? (
          <EmptyState>Nothing recorded yet.</EmptyState>
        ) : (
          <ol className="timeline">
            {history.data.map((entry) => (
              <li key={entry.id}>
                <time>{dateLabel(entry.created_at)}</time>
                <div>
                  <strong>{statusLabel(entry.action)}</strong>
                  <span>{entry.description}</span>
                  <small>
                    {statusLabel(entry.entity_type)} · {entry.service_actor ? `system (${entry.service_actor})` : entry.actor_user_id ? `user ${entry.actor_user_id.slice(0, 8)}` : "unknown actor"}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </section>
  );
}
