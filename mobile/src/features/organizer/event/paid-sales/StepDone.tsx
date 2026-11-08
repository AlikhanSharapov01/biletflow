import { StatusPill } from "@/components/ui";

export function StepDone({ done }: { done: boolean }) {
  return <StatusPill tone={done ? "positive" : "pending"} label={done ? "Done" : "To do"} />;
}
