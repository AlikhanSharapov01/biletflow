import { Brand } from "../../../components/ui/Brand";

// The dark-green introduction column of the sign-in screen.
export function AuthStory() {
  return (
    <section className="auth-story" aria-label="BiletFlow introduction">
      <Brand />
      <div className="story-copy">
        <p className="eyebrow">A city is better together</p>
        <h1 className="serif">
          Make room for <em>what matters.</em>
        </h1>
        <p>Find your people, bring an idea to life, and make the kind of memories that stay after the lights come up.</p>
        <div className="story-ticket">
          <div className="ticket-stamp">
            GOOD
            <br />
            THINGS
            <br />
            HAPPEN
          </div>
          <div>
            <strong>Your next story starts here.</strong>
            <span>Discover · Gather · Belong</span>
          </div>
        </div>
      </div>
      <div className="auth-foot">Made for the moments that bring us closer · Kazakhstan</div>
    </section>
  );
}
