import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { PrimaryButton, SelectField, TextField } from "@/components/ui";
import type { SearchQuery } from "@/features/admin/hooks/useAdminSearch";

// Search text is matched literally by the server (% and _ are not wildcards).
export function AdminSearchForm({
  placeholder,
  statuses,
  statusLabel = "Status",
  onApply,
}: {
  placeholder: string;
  statuses: Array<{ value: string; label: string }>;
  statusLabel?: string;
  onApply: (query: SearchQuery) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const submit = () => onApply({ q: q.trim(), status });

  return (
    <View style={styles.form} accessibilityRole="search">
      <TextField
        label="Search"
        value={q}
        onChangeText={setQ}
        maxLength={100}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={submit}
      />
      <SelectField
        label={statusLabel}
        value={status}
        options={[{ value: "", label: "Any" }, ...statuses]}
        onChange={setStatus}
      />
      <PrimaryButton label="Search" onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12, marginBottom: 8 },
});
