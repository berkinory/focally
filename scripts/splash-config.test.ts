import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { compileModsAsync, withPlugins } from "expo/config-plugins";

import appConfig from "../app.config";
import withFocallyAndroid from "../plugins/with-focally-android.cjs";

test("prebuild replaces the old XML splash without conflicting drawable resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "focally-brand-"));
  const res = join(root, "android/app/src/main/res");
  try {
    await cp(
      new URL("../assets/brand", import.meta.url),
      join(root, "assets/brand"),
      { recursive: true }
    );
    await mkdir(join(res, "values"), { recursive: true });
    await mkdir(join(res, "drawable"), { recursive: true });
    const java = join(root, "android/app/src/main/java/dev/berk/focally");
    await mkdir(java, { recursive: true });
    await writeFile(
      join(java, "MainActivity.kt"),
      "package dev.berk.focally\nimport android.os.Bundle\nimport com.facebook.react.ReactActivity\nclass MainActivity : ReactActivity() {\n  override fun onCreate(savedInstanceState: Bundle?) {\n    super.onCreate(null)\n  }\n}\n"
    );
    await writeFile(join(res, "drawable/splashscreen_logo.xml"), "<vector/>");
    await writeFile(join(res, "values/colors.xml"), "<resources/>");
    await writeFile(join(res, "values/styles.xml"), "<resources/>");
    await writeFile(join(root, "android/gradle.properties"), "");
    await writeFile(
      join(root, "android/app/src/main/AndroidManifest.xml"),
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.berk.focally"><application android:name=".MainApplication" android:icon="@mipmap/ic_launcher"/></manifest>'
    );
    const splashPlugin = appConfig.plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen"
    );
    if (!Array.isArray(splashPlugin) || splashPlugin.length !== 2) {
      throw new Error("Missing splash configuration.");
    }
    const generate = () =>
      compileModsAsync(
        withPlugins(
          withFocallyAndroid({
            ...appConfig,
            plugins: [],
            _internal: {
              projectRoot: fileURLToPath(new URL("..", import.meta.url)),
            },
          }),
          [splashPlugin]
        ),
        { projectRoot: root, platforms: ["android"] }
      );
    await generate();
    await generate();

    for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
      const image = await readFile(
        join(res, `drawable-${density}/splashscreen_logo.png`)
      );
      expect(image.subarray(1, 4).toString()).toBe("PNG");
    }
    expect(
      await Bun.file(join(res, "drawable/splashscreen_logo.xml")).exists()
    ).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);
