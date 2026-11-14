import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SupportContext } from "@/api/types/support";
import { colors, fonts, radii } from "@/theme";

import { contextLinks } from "../utils/supportLabels";
import { t, useLocale } from "@/i18n";

interface ContextChipsProps {
  context: SupportContext;
  ownsRecords?: boolean;
}

// The event, order, ticket or organization a case is about, as small chips.
export function ContextChips({ context, ownsRecords = true }: ContextChipsProps) {
  useLocale();
  const router = useRouter();
  const links = contextLinks(context, ownsRecords);
  if (links.length === 0) return null;
  return (
    <View style={styles.row} accessibilityLabel={t("support.case_context")}>
      {links.map((link) => {
        const href = link.href;
        return href ? (
          <Pressable
            key={link.label}
            accessibilityRole="link"
            accessibilityLabel={t("mobile.support.open_item", { p0: link.label.toLowerCase() })}
            onPress={() => router.push(href)}
            style={({ pressed }) => [styles.chip, styles.linked, pressed && styles.pressed]}
          >
            <Text style={[styles.text, styles.linkText]}>{link.label} ›</Text>
          </Pressable>
        ) : (
          <View key={link.label} style={styles.chip}>
            <Text style={styles.text}>{link.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: radii.pill, backgroundColor: colors.tabTrack },
  linked: { backgroundColor: colors.activeNav },
  pressed: { opacity: 0.6 },
  text: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12, fontWeight: "700" },
  linkText: { color: colors.greenDark },
});
