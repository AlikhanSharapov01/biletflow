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

  // Keeps the selected tab fully visible in a row that scrolls sideways (phones, long labels).
  // Sets scrollLeft instead of using scrollIntoView so the page never moves vertically.
  // Some browsers truncate scrollLeft to an integer, so a fractional target is rounded
  // outwards (up for the end edge, down for the start edge) and the ends snap to 0 and max.
  const selectedIndex = items.findIndex((item) => item.id === value);
  useEffect(() => {
    const selected = refs.current[selectedIndex];
    const row = selected?.parentElement;
    if (!selected || !row) return;

    const reveal = () => {
      const max = row.scrollWidth - row.clientWidth;
      if (max <= 0) return;
      let target = row.scrollLeft;
      if (selectedIndex === 0) target = 0;
      else if (selectedIndex === items.length - 1) target = max;
      else {
        const tab = selected.getBoundingClientRect();
        const box = row.getBoundingClientRect();
        if (tab.left < box.left) target = Math.floor(row.scrollLeft - (box.left - tab.left));
        else if (tab.right > box.right) target = Math.ceil(row.scrollLeft + (tab.right - box.right));
      }
      target = Math.min(Math.max(target, 0), max);
      if (target !== row.scrollLeft) row.scrollLeft = target;
    };

    reveal();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(reveal);
    observer.observe(row);
    // A longer label (locale switch) changes a tab's width without changing the row's.
    for (const tab of refs.current) if (tab) observer.observe(tab);
    return () => observer.disconnect();
  }, [selectedIndex, items.length]);

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
