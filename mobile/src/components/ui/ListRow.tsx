import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radii } from "@/theme";
import { useLocale } from "@/i18n";

type ListRowProps = {
  // Short text or a glyph for the leading tile; omit for no tile.
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  note?: ReactNode;
  // Trailing element, e.g. a StatusPill or a small button.
  trailing?: ReactNode;
  // Makes the whole row a button and shows a chevron.
  onPress?: () => void;
  accessibilityLabel?: string;
  // Full-width content under the row, e.g. an inline form.
  children?: ReactNode;
};

// Icon tile, title with supporting lines and a trailing element (web .list-row):
// tickets, orders, sessions, team members, staff, ticket types, cases.
export function ListRow({ icon, title, meta, note, trailing, onPress, accessibilityLabel, children }: ListRowProps) {
  useLocale();
  const body = (
    <View style={styles.row}>
      {icon !== undefined ? (
        <View style={styles.icon}>
          {typeof icon === "string" ? <Text style={styles.iconText}>{icon}</Text> : icon}
        </View>
      ) : null}
      <View style={styles.info}>
        {typeof title === "string" ? <Text style={styles.title}>{title}</Text> : title}
        {meta ? typeof meta === "string" ? <Text style={styles.meta}>{meta}</Text> : meta : null}
        {note ? typeof note === "string" ? <Text style={styles.note}>{note}</Text> : note : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </View>
  );
  return (
    <View style={styles.wrap}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={({ pressed }) => pressed && styles.pressed}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {children ? <View style={styles.extra}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  pressed: { opacity: 0.6 },
  icon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.input,
    backgroundColor: colors.dateTile,
  },
  iconText: { color: colors.dateTileInk, fontFamily: fonts.sans, fontSize: 14, fontWeight: "700" },
  info: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontFamily: fonts.sans, fontSize: 15, fontWeight: "700" },
  meta: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  note: { color: colors.faint, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
  trailing: { alignItems: "flex-end", gap: 4 },
  chevron: { color: colors.faint, fontSize: 22, fontWeight: "300" },
  extra: { paddingBottom: 12 },
});
