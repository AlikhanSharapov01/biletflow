import { barPath, layoutBars, niceMax, ticks } from "./chart";

describe("chart geometry", () => {
  it("rounds axis maxima up to friendly numbers", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(230)).toBe(250);
    expect(niceMax(480)).toBe(500);
  });

  it("splits the axis into even ticks", () => {
    expect(ticks(20)).toEqual([0, 5, 10, 15, 20]);
  });

  it("lays bars out from the baseline with a gap", () => {
    const bars = layoutBars([0, 5, 10], 300, 100, 10);
    expect(bars).toHaveLength(3);
    expect(bars[0]?.height).toBe(0);
    expect(bars[2]).toMatchObject({ y: 0, height: 100, width: 48 });
    expect(bars[1]?.y).toBe(50);
    expect(layoutBars([], 300, 100)).toEqual([]);
  });

  it("draws nothing for empty bars and a closed path otherwise", () => {
    const [empty, full] = layoutBars([0, 4], 100, 100, 4);
    expect(empty && barPath(empty)).toBe("");
    expect(full && barPath(full)).toMatch(/^M.*Z$/);
  });
});
