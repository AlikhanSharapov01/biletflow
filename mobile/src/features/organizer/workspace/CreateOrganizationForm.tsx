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

interface CreateOrganizationFormProps {
  defaultEmail: string;
  onCreated: (organization: Organization) => void;
}

export function CreateOrganizationForm({ defaultEmail, onCreated }: CreateOrganizationFormProps) {
  const { notify } = useToast();
  const [state, setState] = useState<FormState>(IDLE);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState("");

  const submit = async () => {
    if (!name.trim() || !email.trim()) {
      setState({ ...IDLE, message: "Enter the organization name and a contact email." });
      return;
    }
    setState({ ...IDLE, busy: true });
    try {
      const organization = await createOrganization({
        name: name.trim(),
        contact_email: email.trim(),
        contact_phone: phone.trim() || null,
      });
      notify("Organizer workspace created.");
      setState(IDLE);
      onCreated(organization);
    } catch (failure) {
      setState({ message: describeError(failure), success: false, busy: false });
    }
  };

  return (
    <Panel>
      <SectionHeading title="Create your organizer workspace" subtitle="Set up an organization before creating events." />
      <View style={formStyles.stack}>
        <TextField label="Organization name" value={name} onChangeText={setName} maxLength={200} placeholder="e.g. Northline Collective" />
        <TextField
          label="Contact email"
          value={email}
          onChangeText={setEmail}
          maxLength={254}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextField label="Contact phone" hint="Optional" value={phone} onChangeText={setPhone} maxLength={32} placeholder="+7 …" keyboardType="phone-pad" />
        <FormMessage message={state.message} success={state.success} />
        <PrimaryButton label="Create workspace" onPress={() => void submit()} loading={state.busy} />
      </View>
    </Panel>
  );
}
