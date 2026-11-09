import { t, useLocale } from "../../i18n";
import { Link } from "react-router";

// The "b" tile and wordmark. With `to` it is the home link in the top bar;
// without, a plain mark (the dark-green sign-in story restyles it in CSS).
export function Brand({ to }: { to?: string }) {
  useLocale();
  const content = (
    <>
      <span className="brand-mark" aria-hidden="true">
        b
      </span>
      BiletFlow
    </>
  );
  if (to) {
    return (
      <Link className="brand" to={to} aria-label={t("nav.home")}>
        {content}
      </Link>
    );
  }
  return <span className="brand">{content}</span>;
}
