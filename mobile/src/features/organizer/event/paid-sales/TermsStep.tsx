import { useState } from "react";

import type { PaidSalesChecklist } from "@/api/types/paidSales";
import { ListRow, SubtleButton, TextButton } from "@/components/ui";

import { Intro } from "../../components/Intro";
import { StepDone } from "./StepDone";
import { t, useLocale } from "@/i18n";

interface TermsStepProps {
  terms: PaidSalesChecklist["terms"];
  busy: boolean;
  onAccept: () => void;
}

export function TermsStep({ terms, busy, onAccept }: TermsStepProps) {
  useLocale();
  const [open, setOpen] = useState(false);
  return (
    <ListRow
      icon="T"
      title={t("org.terms_version", { p0: terms.version })}
      meta={t("org.terms_hint")}
      trailing={terms.accepted ? <StepDone done /> : <SubtleButton label={t("org.accept_terms")} disabled={busy} onPress={onAccept} />}
    >
      <TextButton label={open ? t("mobile.org.hide_terms") : t("org.read_terms")} onPress={() => setOpen(!open)} />
      {open ? <Intro style={{ marginTop: 8 }}>{terms.text}</Intro> : null}
    </ListRow>
  );
}
