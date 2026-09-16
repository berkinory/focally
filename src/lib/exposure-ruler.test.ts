import { expect, test } from "bun:test";

import {
  exposureAtOffset,
  exposureOffset,
  rulerSpacing,
} from "./exposure-ruler";

test("ruler position and native EV round-trip for every supported tick", () => {
  for (const step of [1 / 3, 0.5, 1 / 6]) {
    for (
      let index = Math.round(-2 / step);
      index <= Math.round(2 / step);
      index += 1
    ) {
      const ev = index * step;
      expect(
        exposureAtOffset(exposureOffset(ev, -2, 2, step), -2, 2, step)
      ).toBeCloseTo(ev);
    }
  }
});
test("scrolling snaps to camera steps and clamps overscroll", () => {
  expect(exposureAtOffset(-50, -2, 2, 1 / 3)).toBe(-2);
  expect(exposureAtOffset(10_000, -2, 2, 1 / 3)).toBe(2);
  expect(exposureAtOffset(6.4 * rulerSpacing, -2, 2, 1 / 3)).toBeCloseTo(0);
  expect(exposureAtOffset(6.6 * rulerSpacing, -2, 2, 1 / 3)).toBeCloseTo(1 / 3);
});
test("zero reset and a new lens range use the correct centered tick", () => {
  expect(exposureOffset(0, -3, 3, 0.5)).toBe(6 * rulerSpacing);
  expect(exposureOffset(2, -1, 1, 0.5)).toBe(4 * rulerSpacing);
});
