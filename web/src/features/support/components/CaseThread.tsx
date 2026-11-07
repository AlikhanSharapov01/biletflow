import { useEffect, useRef } from "react";
import type { SupportThreadItem } from "../../../api/types/support";
import { dateLabel } from "../../../utils/format";
import { describeChange } from "../supportLabels";
import { MessageBubble } from "./MessageBubble";

interface CaseThreadProps {
  items: SupportThreadItem[];
  viewerId: string;
}

// Messages and history in `seq` order. New items are announced politely and
// the newest one is scrolled into view.
export function CaseThread({ items, viewerId }: CaseThreadProps) {
  const end = useRef<HTMLLIElement | null>(null);
  const count = items.length;

  useEffect(() => {
    if (count > 0) end.current?.scrollIntoView?.({ block: "nearest" });
  }, [count]);

  return (
    <ol className="support-thread" aria-live="polite" aria-label="Case messages">
      {items.map((item) =>
        item.type === "message" ? (
          <MessageBubble key={`m-${item.seq}`} message={item} own={item.author.id === viewerId} />
        ) : (
          <li key={`c-${item.seq}`} className="support-change">
            <span>{describeChange(item)}</span>
            {item.reason && item.reason !== "requester_reply" && item.reason !== "escalated" ? <q>{item.reason}</q> : null}
            <time dateTime={item.created_at}>{dateLabel(item.created_at)}</time>
          </li>
        ),
      )}
      <li ref={end} className="support-thread-end" aria-hidden="true" />
    </ol>
  );
}
