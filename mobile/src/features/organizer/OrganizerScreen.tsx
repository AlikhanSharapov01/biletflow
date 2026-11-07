import { ScrollView, StyleSheet } from "react-native";

import { Screen, TopBar } from "@/components/layout";
import { EmptyState, PageHeading, Panel } from "@/components/ui";

// Placeholder until organizer tools land; copy matches the web Organizer page.
export function OrganizerScreen() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <TopBar />
        <PageHeading
          eyebrow="Organizer workspace"
          title="Bring people together."
          subtitle="Create an organization, prepare events, and publish your next gathering."
        />
        <Panel>
          <EmptyState message="Organizer tools are coming to the app soon." />
        </Panel>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
  },
});
