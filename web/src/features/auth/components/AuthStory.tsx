import { t, useLocale } from "../../../i18n";
import { Brand } from "../../../components/ui/Brand";

// The dark-green introduction column of the sign-in screen.
export function AuthStory() {
  useLocale();
  return (
    <section className="auth-story" aria-label={t("auth.introduction")}>
      <Brand />
      <div className="story-copy">
        <p className="eyebrow">{t("auth.city_together")}</p>
        <h1 className="serif">{t("auth.make_room")}{" "}<em>{t("auth.what_matters")}</em>
        </h1>
        <p>{t("auth.story_copy")}</p>
        <div className="story-ticket">
          <div className="ticket-stamp">{t("auth.stamp_good")}<br />{t("auth.stamp_things")}<br />{t("auth.stamp_happen")}</div>
          <div>
            <strong>{t("auth.next_story")}</strong>
            <span>{t("auth.story_tagline")}</span>
          </div>
        </div>
      </div>
      <div className="auth-foot">{t("auth.story_footer")}</div>
    </section>
  );
}
