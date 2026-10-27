import { ScrollView, StyleSheet } from "react-native";

import { TopBar } from "@/components/TopBar";
import { EmptyState, PageHeading, Panel, Screen } from "@/components/ui";

// Placeholder until event discovery lands; copy matches the web Discover page.
export default function Discover() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <TopBar />
        <PageHeading
          eyebrow="Your city, in good company"
          title="Find your next moment."
          subtitle="Discover what’s happening around you, from the people bringing it to life."
        />
        <Panel>
          <EmptyState message="Event discovery is coming to the app soon." />
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
