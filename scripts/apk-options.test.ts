import { expect, test } from "bun:test";

import { apkTarget } from "./apk-options";

test("phone build defaults to one ARM64 copy, other targets remain explicit", () => {
  expect(apkTarget([])).toEqual({ name: "arm64-v8a", abis: "arm64-v8a" });
  expect(apkTarget(["x86_64"]).abis).toBe("x86_64");
  expect(apkTarget(["universal"]).abis.split(",")).toHaveLength(4);
  expect(() => apkTarget(["--unknown"])).toThrow();
  expect(() => apkTarget(["arm64-v8a", "extra"])).toThrow();
});
