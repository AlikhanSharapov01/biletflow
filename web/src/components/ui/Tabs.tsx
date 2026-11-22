import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

interface TabsProps<T extends string> {
  label: string;
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  // Links each tab to a TabPanel with the same prefix.
  idPrefix?: string;
  // Equal-width segments (the sign-in switch).
  fill?: boolean;
  // A lighter, underlined row for a second level beneath another tablist.
  secondary?: boolean;
}

// A tablist with roving focus: arrow keys, Home and End move between tabs.
export function Tabs<T extends string>({ label, items, value, onChange, idPrefix, fill = false, secondary = false }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keeps the selected tab visible in a row that scrolls sideways (phones, long labels).
  // Sets scrollLeft instead of using scrollIntoView so the page never moves vertically.
  useEffect(() => {
    const selected = refs.current[items.findIndex((item) => item.id === value)];
    const row = selected?.parentElement;
    if (!selected || !row || row.scrollWidth <= row.clientWidth) return;
    const tab = selected.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    if (tab.left < box.left) row.scrollLeft -= box.left - tab.left;
    else if (tab.right > box.right) row.scrollLeft += tab.right - box.right;
  }, [value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1;
    const item = items[next];
    if (!item) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(item.id);
  };

  return (
    <div className={["tabs", fill && "tabs-fill", secondary && "tabs-secondary"].filter(Boolean).join(" ")} role="tablist" aria-label={label}>
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            className={`tab ${selected ? "active" : ""}`}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${item.id}` : undefined}
            aria-selected={selected}
            aria-controls={idPrefix ? `${idPrefix}-panel` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, active, children }: { idPrefix: string; active: string; children: ReactNode }) {
  return (
    <div className="tab-panel" role="tabpanel" id={`${idPrefix}-panel`} aria-labelledby={`${idPrefix}-tab-${active}`}>
      {children}
    </div>
  );
}
