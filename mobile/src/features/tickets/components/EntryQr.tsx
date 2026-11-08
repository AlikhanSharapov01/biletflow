import { StyleSheet, Text, View } from "react-native";

import { QrCode } from "@/components/ui";
import { colors, fonts, radii } from "@/theme";

// The second, short-lived QR. Framed apart from the ticket QR so staff and
// attendees never confuse the two (different purpose, prefix and key).
export function EntryQr({ token }: { token: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.caption}>Entry confirmation — show with your ticket</Text>
      <View style={styles.box}>
        <QrCode value={token} size={176} label="Entry confirmation QR code" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  figure: { alignItems: "center", gap: 8 },
  caption: { color: colors.greenDark, fontFamily: fonts.sans, fontSize: 12, fontWeight: "700", textAlign: "center" },
  box: { padding: 8, borderWidth: 2, borderColor: colors.green, borderRadius: radii.panel, backgroundColor: colors.note },
});
