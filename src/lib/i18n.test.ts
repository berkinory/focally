import { afterEach, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import en from "@/locales/en.json";

import { formatExposure, i18n, nativeMessage } from "./i18n";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

test("an unavailable device language falls back to the bundled English catalog", async () => {
  await i18n.changeLanguage("tr-TR");
  expect(i18n.resolvedLanguage).toBe("en");
  expect(i18n.t("gallery.openPhoto", { date: "A & B" })).toBe(
    en.gallery.openPhoto.replace("{{date}}", "A & B")
  );
});

test("native camera error codes have translations and unknown failures stay user-readable", async () => {
  const files = ["CameraControls", "FocallyCameraView"];
  for (const file of files) {
    const source = await readFile(
      new URL(
        `../../modules/focally-camera/android/src/main/java/expo/modules/focallycamera/${file}.kt`,
        import.meta.url
      ),
      "utf-8"
    );
    const codes = [...source.matchAll(/"([A-Z]+(?:_[A-Z]+)+)"/g)].map(
      (match) => match[1]
    );
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(Object.hasOwn(en.native, code ?? "")).toBe(true);
    }
  }
  expect(nativeMessage("CAPTURE_FAILED")).toBe(en.native.CAPTURE_FAILED);
  expect(nativeMessage("__proto__", "SAVE_FAILED")).toBe(en.native.SAVE_FAILED);
  expect(nativeMessage(new Error("private platform diagnostics"))).toBe(
    en.native.CAMERA_UNAVAILABLE
  );
});

test("exposure labels never sign rounded zero", () => {
  expect(formatExposure(0)).toBe("0.0");
  expect(formatExposure(-0)).toBe("0.0");
  expect(formatExposure(0.001)).toBe("0.0");
  expect(formatExposure(-0.001)).toBe("0.0");
  expect(formatExposure(1 / 3)).toBe("+0.3");
  expect(formatExposure(-1 / 3)).toBe("−0.3");
});
