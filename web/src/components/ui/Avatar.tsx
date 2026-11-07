import { initials } from "../../utils/format";

// Initials in a sand-coloured circle, as on mobile.
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {initials(name)}
    </span>
  );
}
