import { Link } from "react-router";
import type { SupportContext } from "../../../api/types/support";
import { contextLinks } from "../supportLabels";

interface ContextChipsProps {
  context: SupportContext;
  ownsRecords?: boolean;
}

// The event, order, ticket or organization a case is about, as small chips.
export function ContextChips({ context, ownsRecords = true }: ContextChipsProps) {
  const links = contextLinks(context, ownsRecords);
  if (links.length === 0) return null;
  return (
    <ul className="support-chips" aria-label="Case context">
      {links.map((link) => (
        <li key={link.label}>
          {link.to ? (
            <Link className="support-chip" to={link.to}>
              {link.label}
            </Link>
          ) : (
            <span className="support-chip">{link.label}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
