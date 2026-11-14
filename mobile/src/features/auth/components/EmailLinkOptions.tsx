import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { TextButton } from "@/components/ui";
import { colors, fonts } from "@/theme";
import { t, useLocale } from "@/i18n";

// Under the sign-in form: finish an emailed link inside the app, or ask for
// a new verification email for the address typed above.
export function EmailLinkOptions({ onResend }: { onResend: () => void }) {
  useLocale();
  const router = useRouter();
  return (
    <View style={styles.box}>
      <Text style={styles.heading}>{t("mobile.auth.got_email")}</Text>
      <TextButton label={t("mobile.auth.have_verification_link")} onPress={() => router.push("/verify-email")} />
      <TextButton label={t("mobile.auth.have_reset_link")} onPress={() => router.push("/reset-password")} />
      <TextButton label={t("auth.resend_verification")} onPress={onResend} />
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
