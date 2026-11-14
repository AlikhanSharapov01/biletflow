import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { describeError } from "@/api/errors";
import { openCase } from "@/api/support";
import { SUPPORT_CATEGORIES, type SupportCaseCreate, type SupportCaseKind, type SupportCategory } from "@/api/types/support";
import { ScrollScreen } from "@/components/layout";
import { PageHeading, Panel, PrimaryButton, SelectField, TextField, fieldStyles } from "@/components/ui";
import { useToast } from "@/context/ToastContext";

import { FormMessage } from "@/components/ui/FormMessage";
import { ContextChips } from "./components/ContextChips";
import { OrderPicker } from "./components/OrderPicker";
import { OrganizationPicker } from "./components/OrganizationPicker";
import { createRetryKeys } from "./utils/retryKey";
import { CATEGORY_LABELS, KIND_LABELS, contextFromParams, hasContext } from "./utils/supportLabels";
import { t, useLocale } from "@/i18n";

const KIND_OPTIONS = [
  { value: "attendee", label: KIND_LABELS.attendee },
  { value: "organizer_platform", label: KIND_LABELS.organizer_platform },
];
const CATEGORY_OPTIONS = SUPPORT_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));

// `/support/new`, optionally with eventId/orderId/ticketId/organizationId
// params from a "Get help" button.
export function NewCaseScreen() {
  useLocale();
  const params = useLocalSearchParams();
  const router = useRouter();
  const { notify } = useToast();
  const linked = useMemo(() => contextFromParams(params), [params]);
  const recordLinked = Boolean(linked.event_id || linked.order_id || linked.ticket_id);
  const [kind, setKind] = useState<SupportCaseKind>(linked.organization_id && !recordLinked ? "organizer_platform" : "attendee");
  const [category, setCategory] = useState<SupportCategory>("delivery");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [orderId, setOrderId] = useState("");
  const [organizationId, setOrganizationId] = useState(linked.organization_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keys = useMemo(() => createRetryKeys(), []);

  const buildPayload = (): Omit<SupportCaseCreate, "client_message_id"> => {
    const base = { kind, category, subject: subject.trim(), body: body.trim() };
    if (kind === "organizer_platform") return { ...base, organization_id: organizationId, event_id: linked.event_id };
    if (recordLinked) return { ...base, event_id: linked.event_id, order_id: linked.order_id, ticket_id: linked.ticket_id };
    return { ...base, order_id: orderId };
  };

  const submit = async () => {
    const payload = buildPayload();
    if (!payload.subject || !payload.body) {
      setError(t("support.new_case_required"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await openCase({ ...payload, client_message_id: keys.keyFor(payload) });
      notify(created.message.replayed ? t("support.already_opened") : t("support.opened_success"));
      router.replace({ pathname: "/support/cases/[caseId]", params: { caseId: created.case.id } });
    } catch (failure) {
      setError(describeError(failure));
      setBusy(false);
    }
  };

  return (
    <ScrollScreen backLabel={t("nav.support")}>
      <PageHeading
        eyebrow={t("nav.support")}
        title={t("support.new_case_title")}
        subtitle={t("support.new_case_hint")}
      />
      <Panel style={styles.form}>
        {hasContext(linked) ? (
          <View style={styles.field}>
            <Text style={fieldStyles.label}>{t("support.about")}</Text>
            <ContextChips context={linked} />
          </View>
        ) : null}
        <SelectField label={t("support.about_question")} value={kind} options={KIND_OPTIONS} onChange={(value) => setKind(value as SupportCaseKind)} />
        {kind === "attendee" && !recordLinked ? <OrderPicker value={orderId} onChange={setOrderId} /> : null}
        {kind === "organizer_platform" && !linked.organization_id ? (
          <OrganizationPicker value={organizationId} onChange={setOrganizationId} />
        ) : null}
        <SelectField
          label={t("discover.category")}
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={(value) => setCategory(value as SupportCategory)}
        />
        <TextField label={t("support.subject")} accessibilityLabel={t("support.subject")} value={subject} maxLength={200} onChangeText={setSubject} />
        <TextField label={t("support.message")} hint={t("support.message_limit")} accessibilityLabel={t("support.message")} value={body} maxLength={5000} multiline onChangeText={setBody} />
        <FormMessage message={error} />
        <PrimaryButton label={busy ? t("support.opening") : t("support.open_case")} disabled={busy} onPress={() => void submit()} />
      </Panel>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  field: { gap: 7 },
});
