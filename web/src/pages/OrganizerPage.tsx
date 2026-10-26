import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  createEvent,
  createOrganization,
  createTicketType,
  duplicateEvent,
  inviteMember,
  listCategories,
  listInvitations,
  listMembers,
  listOrganizationEvents,
  listOrganizations,
  listVenues,
  publishEvent,
  revokeInvitation,
  revokeMember,
  unpublishEvent,
} from "../api/catalog";
import { describeError } from "../api/errors";
import type { Category, EventInput, EventView, Organization, Venue } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { EventForm } from "../components/EventForm";
import { EmptyState, ErrorPanel, FormMessage, Loading } from "../components/Feedback";
import { useToast } from "../components/Toast";
import { useRequest } from "../hooks/useRequest";
import { dateLabel, dayNumber, monthShort, statusLabel } from "../utils/format";

interface FormState {
  message: string;
  success: boolean;
  busy: boolean;
}

const IDLE: FormState = { message: "", success: false, busy: false };

function text(data: FormData, name: string): string {
  return String(data.get(name) ?? "").trim();
}

export function OrganizerPage() {
  const { profile } = useAuth();
  const [organizationId, setOrganizationId] = useState("");

  const base = useRequest(
    async () => {
      const [organizations, categories, venues] = await Promise.all([listOrganizations(), listCategories(), listVenues()]);
      return { organizations, categories, venues };
    },
    [],
  );

  // Keep the selection valid as workspaces load or get created.
  useEffect(() => {
    const organizations = base.data?.organizations ?? [];
    if (!organizations.some((org) => org.id === organizationId)) {
      setOrganizationId(organizations[0]?.id ?? "");
    }
  }, [base.data, organizationId]);

  if (base.loading) return <Loading label="Loading organizer workspace…" />;
  if (base.error || !base.data) {
    return <ErrorPanel title="We couldn’t load the organizer workspace." message={base.error ?? ""} onRetry={base.reload} />;
  }

  const { organizations, categories, venues } = base.data;
  const organization = organizations.find((org) => org.id === organizationId) ?? null;
  const isOwner = Boolean(organization && profile && organization.owner_user_id === profile.id);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Organizer workspace</p>
          <h1 className="serif">Bring people together.</h1>
          <p>Create an organization, prepare events, and publish your next gathering.</p>
        </div>
      </div>
      {organization ? (
        <>
          <div className="org-toolbar">
            {organizations.length > 1 ? (
              <label className="field compact-field org-picker">
                <span>Workspace</span>
                <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="org-heading">
                <strong>{organization.name}</strong>
                <span>
                  {organization.contact_email} · {isOwner ? "You own this workspace" : "You are a team member"}
                </span>
              </div>
            )}
          </div>
          <div className="content-grid organizer-live-grid">
            <div className="organizer-live-column">
              <EventsPanel organization={organization} venues={venues} />
              <CreateEventPanel organization={organization} categories={categories} venues={venues} />
            </div>
            <div className="organizer-live-column">
              <aside className="panel organizer-note">
                <p className="eyebrow">A good first step</p>
                <h2>Make the details easy to find.</h2>
                <p>Choose a venue and category, set your event dates, then publish when your listing is ready for guests.</p>
              </aside>
              <TeamPanel organization={organization} isOwner={isOwner} />
            </div>
          </div>
        </>
      ) : (
        <div className="content-grid">
          <section>
            <CreateOrganizationForm
              defaultEmail={profile?.email ?? ""}
              onCreated={(org) => {
                setOrganizationId(org.id);
                base.reload();
              }}
            />
          </section>
          <aside className="panel organizer-note">
            <p className="eyebrow">Organizer workspace</p>
            <h2>Your events start here.</h2>
            <p>Create your organization to manage event listings and bring your community together.</p>
          </aside>
        </div>
      )}
    </>
  );
}

interface CreateOrganizationFormProps {
  defaultEmail: string;
  onCreated: (organization: Organization) => void;
}

function CreateOrganizationForm({ defaultEmail, onCreated }: CreateOrganizationFormProps) {
  const { notify } = useToast();
  const [state, setState] = useState<FormState>(IDLE);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setState({ ...IDLE, busy: true });
    try {
      const organization = await createOrganization({
        name: text(data, "name"),
        contact_email: text(data, "contact_email"),
        contact_phone: text(data, "contact_phone") || null,
      });
      notify("Organizer workspace created.");
      onCreated(organization);
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  return (
    <section className="panel live-form-panel">
      <div className="panel-heading">
        <h2>Create your organizer workspace</h2>
      </div>
      <p className="form-intro">Set up an organization before creating events.</p>
      <form className="live-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="field">
          <span>Organization name</span>
          <input name="name" required maxLength={200} placeholder="e.g. Northline Collective" />
        </label>
        <label className="field">
          <span>Contact email</span>
          <input name="contact_email" type="email" defaultValue={defaultEmail} required maxLength={254} />
        </label>
        <label className="field">
          <span>
            Contact phone <small>Optional</small>
          </span>
          <input name="contact_phone" maxLength={32} placeholder="+7 …" />
        </label>
        <FormMessage message={state.message} success={state.success} />
        <button className="primary-button" type="submit" disabled={state.busy}>
          Create workspace
        </button>
      </form>
    </section>
  );
}

interface EventsPanelProps {
  organization: Organization;
  venues: Venue[];
}

function EventsPanel({ organization, venues }: EventsPanelProps) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const events = useRequest(() => listOrganizationEvents(organization.id), [organization.id]);
  const [pendingId, setPendingId] = useState("");

  const run = async (event: EventView, action: () => Promise<unknown>, done: string) => {
    setPendingId(event.id);
    try {
      await action();
      notify(done);
      events.reload();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setPendingId("");
    }
  };

  const duplicate = async (event: EventView) => {
    setPendingId(event.id);
    try {
      const copy = await duplicateEvent(event.id);
      notify("Draft copied. Adjust its dates before publishing.");
      navigate(`/organizer/events/${encodeURIComponent(copy.id)}`);
    } catch (failure) {
      notify(describeError(failure));
      setPendingId("");
    }
  };

  return (
    <section className="panel live-form-panel">
      <div className="panel-heading">
        <h2>Your events</h2>
        <span className="status neutral">{events.data?.length ?? 0} total</span>
      </div>
      {events.loading ? <Loading label="Loading events…" /> : null}
      {events.error ? <ErrorPanel title="We couldn’t load your events." message={events.error} onRetry={events.reload} /> : null}
      {events.data ? (
        <div className="managed-event-list">
          {events.data.length === 0 ? (
            <EmptyState>No events in this workspace yet. Create a draft to get started.</EmptyState>
          ) : (
            events.data.map((event) => {
              const venue = venues.find((item) => item.id === event.venue_id);
              const published = event.publication_state === "published";
              const busy = pendingId === event.id;
              return (
                <div className="managed-event managed-event-wide" key={event.id}>
                  <div className="event-date">
                    <b>{dayNumber(event.starts_at)}</b>
                    <span>{monthShort(event.starts_at)}</span>
                  </div>
                  <div className="event-copy">
                    <strong>
                      <Link to={`/organizer/events/${encodeURIComponent(event.id)}`}>{event.title}</Link>
                    </strong>
                    <span>
                      {venue ? `${venue.name} · ${venue.city}` : "Venue unavailable"} · {dateLabel(event.starts_at)} · {event.time_status}
                    </span>
                  </div>
                  <span className={`status ${published ? "" : event.publication_state === "cancelled" ? "blocked" : "neutral"}`}>
                    {statusLabel(event.publication_state)}
                  </span>
                  <div className="row-actions">
                    <Link className="subtle-button compact-action" to={`/organizer/events/${encodeURIComponent(event.id)}`}>
                      Manage
                    </Link>
                    {event.publication_state !== "cancelled" ? (
                      <button
                        className="subtle-button compact-action"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            event,
                            () => (published ? unpublishEvent(event.id) : publishEvent(event.id)),
                            published ? "Event unpublished." : "Event published.",
                          )
                        }
                      >
                        {published ? "Unpublish" : "Publish"}
                      </button>
                    ) : null}
                    <button className="subtle-button compact-action" type="button" disabled={busy} onClick={() => void duplicate(event)}>
                      Duplicate
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
}

interface CreateEventPanelProps {
  organization: Organization;
  categories: Category[];
  venues: Venue[];
}

function CreateEventPanel({ organization, categories, venues }: CreateEventPanelProps) {
  const { notify } = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState<FormState>(IDLE);

  const submit = async (input: EventInput) => {
    setState({ ...IDLE, busy: true });
    try {
      const created = await createEvent(organization.id, input);
      try {
        await createTicketType(created.id, {
          name: "General admission",
          description: "",
          kind: "free",
          price_minor: 0,
          quantity_limit: input.capacity,
          per_order_limit: Math.min(5, Math.max(1, input.capacity)),
          sales_open_at: input.registration_opens_at,
          sales_close_at: input.registration_closes_at,
          is_hidden: false,
        });
        notify("Event draft created with a free RSVP ticket.");
      } catch (failure) {
        notify(`The event draft was saved, but its RSVP ticket could not be created: ${describeError(failure)}`);
      }
      setState(IDLE);
      navigate(`/organizer/events/${encodeURIComponent(created.id)}`);
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  return (
    <section className="panel live-form-panel">
      <div className="panel-heading">
        <h2>Create an event draft</h2>
      </div>
      <p className="form-intro">A free RSVP ticket is added automatically so a valid event can be published. You can add more ticket types on the event page.</p>
      <EventForm
        categories={categories}
        venues={venues}
        submitLabel="Create event draft"
        busy={state.busy}
        message={state.message}
        onSubmit={submit}
        onInvalid={(error) => setState({ message: error, success: false, busy: false })}
      />
    </section>
  );
}

interface TeamPanelProps {
  organization: Organization;
  isOwner: boolean;
}

function TeamPanel({ organization, isOwner }: TeamPanelProps) {
  const { notify } = useToast();
  const [state, setState] = useState<FormState>(IDLE);
  const team = useRequest(
    async () => {
      const [members, invitations] = await Promise.all([listMembers(organization.id), listInvitations(organization.id)]);
      return { members, invitations: invitations.filter((item) => !item.accepted_at && !item.revoked_at) };
    },
    [organization.id],
  );

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = text(new FormData(form), "email");
    setState({ ...IDLE, busy: true });
    try {
      await inviteMember(organization.id, email);
      notify(`Invitation emailed to ${email}.`);
      form.reset();
      setState(IDLE);
      team.reload();
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  const remove = async (label: string, action: () => Promise<unknown>) => {
    if (!window.confirm(`Remove ${label}?`)) return;
    try {
      await action();
      notify("Removed.");
      team.reload();
    } catch (failure) {
      notify(describeError(failure));
    }
  };

  return (
    <section className="panel live-form-panel">
      <div className="panel-heading">
        <div>
          <h2>Team</h2>
          <p className="panel-subtitle">Invite staff by email, then assign them to events with the capabilities they need.</p>
        </div>
      </div>
      {team.loading ? <Loading label="Loading team…" /> : null}
      {team.error ? <p className="form-intro">{team.error} Only the owner and staff managers can see the team.</p> : null}
      {team.data ? (
        <>
          <div className="session-list">
            {team.data.members.map((member) => {
              const owner = member.user_id === organization.owner_user_id;
              const active = member.status === "active" && !member.revoked_at;
              return (
                <article className="session-row" key={member.id}>
                  <div className="session-icon" aria-hidden="true">
                    {owner ? "★" : "M"}
                  </div>
                  <div className="session-info">
                    <strong>
                      {member.display_name}
                      {owner ? <span className="status">Owner</span> : null}
                      {!active ? <span className="status neutral">Revoked</span> : null}
                    </strong>
                    <span>{member.email}</span>
                    <small>{owner ? "All permissions" : member.capabilities.length ? member.capabilities.map(statusLabel).join(", ") : "No workspace permissions"}</small>
                  </div>
                  {!owner && active && isOwner ? (
                    <button className="subtle-button revoke-session" type="button" onClick={() => void remove(member.display_name, () => revokeMember(organization.id, member.id))}>
                      Remove
                    </button>
                  ) : null}
                </article>
              );
            })}
            {team.data.invitations.map((invitation) => (
              <article className="session-row" key={invitation.id}>
                <div className="session-icon" aria-hidden="true">
                  ✉
                </div>
                <div className="session-info">
                  <strong>
                    {invitation.email} <span className="status pending">Invited</span>
                  </strong>
                  <span>Expires {dateLabel(invitation.expires_at)}</span>
                </div>
                <button className="subtle-button revoke-session" type="button" onClick={() => void remove(`the invitation for ${invitation.email}`, () => revokeInvitation(organization.id, invitation.id))}>
                  Revoke
                </button>
              </article>
            ))}
          </div>
          <form className="live-form invite-form" onSubmit={(event) => void invite(event)}>
            <label className="field">
              <span>Invite by email</span>
              <input name="email" type="email" required maxLength={254} placeholder="colleague@example.com" />
            </label>
            <FormMessage message={state.message} />
            <button className="subtle-button" type="submit" disabled={state.busy}>
              Send invitation
            </button>
          </form>
        </>
      ) : null}
    </section>
  );
}
