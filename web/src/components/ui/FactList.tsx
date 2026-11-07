import type { ReactNode } from "react";

// Label/value pairs, e.g. an event's details or an order summary.
export function FactList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <ul className="fact-list">
      {items.map((item) => (
        <li key={item.label}>
          <strong>{item.label}</strong>
          {item.value}
        </li>
      ))}
    </ul>
  );
}
