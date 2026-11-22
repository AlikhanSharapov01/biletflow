import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { PageHeading } from "@/components/ui/PageHeading";
import { typography } from "@/theme";

describe("PageHeading", () => {
  it("renders the title with the title type style", async () => {
    await render(<PageHeading eyebrow="Eyebrow" title="Events" />);
    const style = StyleSheet.flatten(screen.getByText("Events").props.style);
    expect(style).toMatchObject(typography.title);
  });
});
