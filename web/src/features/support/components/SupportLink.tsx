import { ButtonLink } from "../../../components/ui";
import { newCasePath } from "../supportLabels";

interface SupportLinkProps {
  eventId?: string;
  orderId?: string;
  ticketId?: string;
  organizationId?: string;
  label?: string;
}

// "Get help" button for event, order and ticket pages: opens the new-case form
// with that record already attached as context.
export function SupportLink({ eventId, orderId, ticketId, organizationId, label = "Get help" }: SupportLinkProps) {
  const to = newCasePath({ event_id: eventId, order_id: orderId, ticket_id: ticketId, organization_id: organizationId });
  return (
    <ButtonLink size="sm" to={to}>
      {label}
    </ButtonLink>
  );
}
