import { expect, test } from "bun:test";

import {
  countdownRemaining,
  defaults,
  exposureValue,
  parseSetting,
  parseStartup,
  restoredSetting,
  startupSetting,
} from "./camera-settings";

test("launch choices restore the last value or use the selected fixed value", () => {
  expect(startupSetting("focalLength", "last", 85)).toBe(85);
  expect(startupSetting("focalLength", 35, 85)).toBe(35);
  expect(startupSetting("ratio", "last", "1:1")).toBe("1:1");
  expect(startupSetting("ratio", "4:3", "1:1")).toBe("4:3");
  expect(startupSetting("timer", "last", 10)).toBe(10);
  expect(startupSetting("timer", 0, 10)).toBe(0);
});
test("exposure and flash restore only when their own remember choice is enabled", () => {
  expect(restoredSetting("exposure", false, -2)).toBe(0);
  expect(restoredSetting("exposure", true, -2)).toBe(-2);
  expect(restoredSetting("flash", false, "on")).toBe("off");
  expect(restoredSetting("flash", true, "auto")).toBe("auto");
});
test("preference parsing rejects corrupt values and restores safe defaults", () => {
  expect(startupSetting("ratio", "last", "16:9")).toBe(defaults.ratio);
  expect(restoredSetting("exposure", true, Number.NaN)).toBe(0);
  expect(restoredSetting("exposure", true, Number.POSITIVE_INFINITY)).toBe(0);
  expect(startupSetting("timer", "last", 99)).toBe(0);
  expect(parseStartup("timer", 99)).toBeUndefined();
  expect(parseSetting("grid", "true")).toBeUndefined();
});
test("exposure obeys the selected lens range and quantization", () => {
  expect(exposureValue(4, -2, 2, 1 / 3)).toBe(2);
  expect(exposureValue(-4, -2, 2, 1 / 3)).toBe(-2);
  expect(exposureValue(0.41, -2, 2, 1 / 3)).toBeCloseTo(1 / 3);
  expect(exposureValue(1, 0, 0, 0)).toBe(0);
});
test("timer uses a deadline and cannot drift or produce negative counts", () => {
  expect(countdownRemaining(4000, 1000)).toBe(3);
  expect(countdownRemaining(4000, 1999)).toBe(3);
  expect(countdownRemaining(4000, 2000)).toBe(2);
  expect(countdownRemaining(4000, 4200)).toBe(0);
});
