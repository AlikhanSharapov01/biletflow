import type { SupportMessage } from "../../../api/types/support";
import { dateLabel } from "../../../utils/format";
import { AttachmentList } from "./AttachmentList";

interface MessageBubbleProps {
  message: SupportMessage;
  own: boolean;
}

// One chat bubble: own messages on the right, everyone else on the left with
// their name and a "Support" tag for staff replies.
export function MessageBubble({ message, own }: MessageBubbleProps) {
  return (
    <li className={`support-message ${own ? "own" : ""}`}>
      <div className="support-bubble">
        <p className="support-message-meta">
          <strong>{own ? "You" : message.author.display_name}</strong>
          {message.author_role === "support" && !own ? <span className="support-role">Support</span> : null}
          <time dateTime={message.created_at}>{dateLabel(message.created_at)}</time>
        </p>
        <p className="support-message-body">{message.body}</p>
        <AttachmentList caseId={message.case_id} attachments={message.attachments} />
      </div>
    </li>
  );
}
