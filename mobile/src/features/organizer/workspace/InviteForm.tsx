import { useState } from "react";
import { View } from "react-native";

import { describeError } from "@/api/errors";
import { inviteMember } from "@/api/organizations";
import { SubtleButton, TextField } from "@/components/ui";
import { useToast } from "@/context/ToastContext";

import { FormMessage } from "@/components/ui/FormMessage";
import { formStyles } from "../components/formStyles";
import { t, useLocale } from "@/i18n";

export function InviteForm({ organizationId, onInvited }: { organizationId: string; onInvited: () => void }) {
  useLocale();
  const { notify } = useToast();
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });

  const invite = async () => {
    const address = email.trim();
    if (!address) {
      setState({ busy: false, message: t("mobile.org.enter_email") });
      return;
    }
    setState({ busy: true, message: "" });
    try {
      await inviteMember(organizationId, address);
      notify(t("org.invitation_sent", { p0: address }));
      setEmail("");
      setState({ busy: false, message: "" });
      onInvited();
    } catch (failure) {
      setState({ busy: false, message: describeError(failure) });
    }
  };

  return (
    <View style={[formStyles.stack, { marginTop: 14 }]}>
      <TextField
        label={t("organizer.invite_email")}
        value={email}
        onChangeText={setEmail}
        maxLength={254}
        placeholder="colleague@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <FormMessage message={state.message} />
      <SubtleButton label={t("organizer.send_invitation")} onPress={() => void invite()} loading={state.busy} />
    </View>
  );
}
