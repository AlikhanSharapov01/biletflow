import { useState } from "react";

import type { PaidSalesChecklist } from "@/api/types/paidSales";
import { ListRow, SubtleButton, TextButton } from "@/components/ui";

import { Intro } from "../../components/Intro";
import { StepDone } from "./StepDone";

interface TermsStepProps {
  terms: PaidSalesChecklist["terms"];
  busy: boolean;
  onAccept: () => void;
}

export function TermsStep({ terms, busy, onAccept }: TermsStepProps) {
  const [open, setOpen] = useState(false);
  return (
    <ListRow
      icon="T"
      title={`Organizer terms · version ${terms.version}`}
      meta="Accepted per event and per terms version."
      trailing={terms.accepted ? <StepDone done /> : <SubtleButton label="Accept terms" disabled={busy} onPress={onAccept} />}
    >
      <TextButton label={open ? "Hide the terms" : "Read the terms"} onPress={() => setOpen(!open)} />
      {open ? <Intro style={{ marginTop: 8 }}>{terms.text}</Intro> : null}
    </ListRow>
  );
}
