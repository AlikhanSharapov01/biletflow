import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { TextButton } from "@/components/ui";
import { colors, fonts } from "@/theme";

// Under the sign-in form: finish an emailed link inside the app, or ask for
// a new verification email for the address typed above.
export function EmailLinkOptions({ onResend }: { onResend: () => void }) {
  const router = useRouter();
  return (
    <View style={styles.box}>
      <Text style={styles.heading}>Got an email from us?</Text>
      <TextButton label="I have a verification link" onPress={() => router.push("/verify-email")} />
      <TextButton label="I have a reset link" onPress={() => router.push("/reset-password")} />
      <TextButton label="Resend the verification email" onPress={onResend} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 22,
    paddingTop: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  heading: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12, fontWeight: "600" },
});
