import { useState } from "react";
import { View } from "react-native";

import { describeError } from "@/api/errors";
import { createOrganization } from "@/api/organizations";
import type { Organization } from "@/api/types";
import { Panel, PrimaryButton, TextField } from "@/components/ui";
import { useToast } from "@/context/ToastContext";

import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "../components/formStyles";
import { SectionHeading } from "../components/SectionHeading";
import { IDLE, type FormState } from "../utils/formState";
import { t, useLocale } from "@/i18n";

interface CreateOrganizationFormProps {
  defaultEmail: string;
  onCreated: (organization: Organization) => void;
}

export function CreateOrganizationForm({ defaultEmail, onCreated }: CreateOrganizationFormProps) {
  useLocale();
  const { notify } = useToast();
  const [state, setState] = useState<FormState>(IDLE);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState("");

  const submit = async () => {
    if (!name.trim() || !email.trim()) {
      setState({ ...IDLE, message: t("mobile.org.org_required") });
      return;
    }
    setState({ ...IDLE, busy: true });
    try {
      const organization = await createOrganization({
        name: name.trim(),
        contact_email: email.trim(),
        contact_phone: phone.trim() || null,
      });
      notify(t("org.workspace_created"));
      setState(IDLE);
      onCreated(organization);
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  return (
    <Panel>
      <SectionHeading title={t("org.create_workspace_title")} subtitle={t("org.setup_first")} />
      <View style={formStyles.stack}>
        <TextField label={t("org.organization_name")} value={name} onChangeText={setName} maxLength={200} placeholder={t("org.organization_example")} />
        <TextField
          label={t("org.contact_email")}
          value={email}
          onChangeText={setEmail}
          maxLength={254}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextField label={t("org.contact_phone")} hint={t("common.optional")} value={phone} onChangeText={setPhone} maxLength={32} placeholder="+7 …" keyboardType="phone-pad" />
        <FormMessage message={state.message} success={state.success} />
        <PrimaryButton label={t("org.create_workspace")} onPress={() => void submit()} loading={state.busy} />
      </View>
    </Panel>
  );
}
