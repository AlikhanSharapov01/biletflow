import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/api/errors";
import { acceptInvitation } from "@/api/organizations";
import { ScrollScreen } from "@/components/layout";
import { PageHeading, Panel, PrimaryButton, TextField } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { tokenFromLink } from "@/utils/format";

import { FormMessage } from "@/components/ui/FormMessage";
import { Intro } from "./components/Intro";
import { t, useLocale } from "@/i18n";

// Staff invitation (web AcceptInvitationPage). The emailed link carries the
// token; on a phone the person pastes the link or the token itself.
export function AcceptInvitationScreen() {
  useLocale();
  const params = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const [input, setInput] = useState(params.token ?? "");
  const [state, setState] = useState({ busy: false, done: false, message: "" });
  const token = tokenFromLink(input);

  const accept = async () => {
    if (!token) {
      setState({ busy: false, done: false, message: t("mobile.org.invitation_intro") });
      return;
    }
    setState({ busy: true, done: false, message: "" });
    try {
      await acceptInvitation(token);
      setState({ busy: false, done: true, message: t("auth.joined") });
    } catch (failure) {
      setState({ busy: false, done: false, message: describeError(failure) });
    }
  };

  return (
    <ScrollScreen>
      <PageHeading eyebrow={t("auth.organizer_invitation")} title={t("auth.join_workspace")} />
      <Panel>
        <View style={styles.stack}>
          <Intro>
            {t("auth.signed_in_as")} {profile?.email ?? t("mobile.org.your_account")}{t("auth.invitation_address")}
          </Intro>
          {!state.done ? (
            <TextField
              label={t("mobile.org.invitation_field")}
              value={input}
              onChangeText={setInput}
              placeholder={t("mobile.org.paste_invitation")}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}
          <FormMessage message={state.message} success={state.done} />
          {state.done ? (
            <PrimaryButton label={t("auth.open_workspace")} onPress={() => router.replace("/organizer")} />
          ) : (
            <PrimaryButton label={state.busy ? t("auth.joining") : t("auth.accept_invitation")} onPress={() => void accept()} disabled={state.busy} />
          )}
        </View>
      </Panel>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
});
