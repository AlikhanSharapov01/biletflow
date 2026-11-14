import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { revokeSession } from "@/api/account";
import { describeError } from "@/api/errors";
import type { SessionView } from "@/api/types";
import { EmptyState, ListRow, StatusPill, SubtleButton } from "@/components/ui";
import { useToast } from "@/context/ToastContext";
import { colors, fonts } from "@/theme";
import { dateLabel } from "@/utils/format";
import { t, useLocale } from "@/i18n";

// Every session of the account, newest first; any active one other than
// this device can be revoked (web SessionList).
export function SessionList({
  sessions,
  currentId,
  onChanged,
}: {
  sessions: SessionView[];
  currentId: string;
  onChanged: () => void;
}) {
  useLocale();
  const { notify } = useToast();
  const [revoking, setRevoking] = useState("");
  const now = Date.now();

  if (sessions.length === 0) return <EmptyState message={t("account.no_sessions")} />;

  async function revoke(id: string) {
    setRevoking(id);
    try {
      await revokeSession(id);
      notify(t("account.session_revoked"));
      onChanged();
    } catch (failure) {
      notify(describeError(failure));
    } finally {
      setRevoking("");
    }
  }

  return (
    <View>
      {sessions.map((item) => {
        const current = item.id === currentId;
        const revoked = Boolean(item.revoked_at);
        const expired = new Date(item.expires_at).getTime() <= now;
        const active = !revoked && !expired;
        const label = current ? t("account.this_device") : item.client_kind === "web" ? t("account.web_browser") : t("account.scanner");
        const lifecycle = revoked
          ? t("account.revoked_at", { p0: dateLabel(item.revoked_at) })
          : expired
            ? t("account.expired_at", { p0: dateLabel(item.expires_at) })
            : t("account.expires_at", { p0: dateLabel(item.expires_at) });
        return (
          <ListRow
            key={item.id}
            icon={item.client_kind === "web" ? "W" : "S"}
            title={
              <View style={styles.title}>
                <Text style={styles.titleText}>{label}</Text>
                {current ? <StatusPill label={t("account.current")} /> : null}
              </View>
            }
            meta={t("account.session_meta", { p0: dateLabel(item.created_at), p1: item.last_seen_at ? dateLabel(item.last_seen_at) : t("account.not_yet") })}
            note={lifecycle}
            trailing={
              active && !current ? (
                <SubtleButton
                  label={t("organizer.revoke")}
                  danger
                  loading={revoking === item.id}
                  onPress={() => void revoke(item.id)}
                />
              ) : undefined
            }
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  titleText: { color: colors.ink, fontFamily: fonts.sans, fontSize: 15, fontWeight: "700" },
});
