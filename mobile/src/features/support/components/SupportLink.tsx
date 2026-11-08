import { useRouter } from "expo-router";

import { SubtleButton } from "@/components/ui";

import { newCaseHref } from "../utils/supportLabels";

interface SupportLinkProps {
  eventId?: string;
  orderId?: string;
  ticketId?: string;
  organizationId?: string;
  label?: string;
}

// "Get help" button for event, order and ticket screens: opens the new-case
// form with that record already attached as context.
export function SupportLink({ eventId, orderId, ticketId, organizationId, label = "Get help" }: SupportLinkProps) {
  const router = useRouter();
  const href = newCaseHref({ event_id: eventId, order_id: orderId, ticket_id: ticketId, organization_id: organizationId });
  return <SubtleButton label={label} onPress={() => router.push(href)} />;
}
