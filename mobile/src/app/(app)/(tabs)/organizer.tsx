import { ScrollView, StyleSheet } from "react-native";

import { TopBar } from "@/components/TopBar";
import { EmptyState, PageHeading, Panel, Screen } from "@/components/ui";

// Placeholder until organizer tools land; copy matches the web Organizer page.
export default function Organizer() {
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
