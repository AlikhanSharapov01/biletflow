import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Eyebrow, SerifText } from "@/components/ui/Text";
import { fonts } from "@/theme";

// Eyebrow, serif title and a short line of copy (web .page-heading).
export function PageHeading({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <View style={styles.heading}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <SerifText style={styles.title}>{title}</SerifText>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    marginBottom: 20,
  },
  title: {
    marginTop: 6,
    fontSize: 30,
    letterSpacing: -1,
    lineHeight: 34,
  },
  subtitle: {
    marginTop: 8,
    color: "#79847d",
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
});
