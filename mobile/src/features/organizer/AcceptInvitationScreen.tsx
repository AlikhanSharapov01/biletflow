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

// Staff invitation (web AcceptInvitationPage). The emailed link carries the
// token; on a phone the person pastes the link or the token itself.
export function AcceptInvitationScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const [input, setInput] = useState(params.token ?? "");
  const [state, setState] = useState({ busy: false, done: false, message: "" });
  const token = tokenFromLink(input);

  const accept = async () => {
    if (!token) {
      setState({ busy: false, done: false, message: "Paste the invitation link or token from the email to accept the invitation." });
      return;
    }
    setState({ busy: true, done: false, message: "" });
    try {
      await acceptInvitation(token);
      setState({ busy: false, done: true, message: "You joined the workspace. The owner can now assign you to events." });
    } catch (failure) {
      setState({ busy: false, done: false, message: describeError(failure) });
    }
  };

  return (
    <ScrollScreen>
      <PageHeading eyebrow="Organizer invitation" title="Join a workspace" />
      <Panel>
        <View style={styles.stack}>
          <Intro>
            You are signed in as {profile?.email ?? "your account"}. The invitation must have been sent to this exact address.
          </Intro>
          {!state.done ? (
            <TextField
              label="Invitation link or token"
              value={input}
              onChangeText={setInput}
              placeholder="Paste the link from the email"
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}
          <FormMessage message={state.message} success={state.done} />
          {state.done ? (
            <PrimaryButton label="Open the organizer workspace" onPress={() => router.replace("/organizer")} />
          ) : (
            <PrimaryButton label={state.busy ? "Joining…" : "Accept invitation"} onPress={() => void accept()} disabled={state.busy} />
          )}
        </View>
      </Panel>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
});
