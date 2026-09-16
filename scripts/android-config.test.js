import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AndroidConfig,
  compileModsAsync,
  withPlugins,
} from "expo/config-plugins";

import appConfig from "../app.config";
import withAndroidSigning from "../plugins/with-android-signing.cjs";
import withFocallyAndroid from "../plugins/with-focally-android.cjs";

test("repeated prebuild preserves offline permissions, API compatibility and the release hook", async () => {
  const root = await mkdtemp(join(tmpdir(), "focally-config-"));
  const android = join(root, "android");
  const manifest = join(android, "app/src/main/AndroidManifest.xml");
  const gradle = join(android, "app/build.gradle");
  const properties = join(android, "gradle.properties");
  const styles = join(android, "app/src/main/res/values/styles.xml");
  try {
    await mkdir(join(android, "app/src/main/res/values"), { recursive: true });
    await writeFile(
      styles,
      '<resources><style name="Theme.App.SplashScreen" parent="Theme.SplashScreen"><item name="windowSplashScreenAnimatedIcon">@drawable/splashscreen_logo</item><item name="android:windowSplashScreenBehavior">icon_preferred</item></style></resources>'
    );
    await writeFile(
      manifest,
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.berk.focally"><application/></manifest>'
    );
    await writeFile(
      gradle,
      "android { buildTypes { release { signingConfig signingConfigs.debug } } }\n"
    );
    await writeFile(
      properties,
      "org.gradle.jvmargs=-Xmx2048m\norg.gradle.caching=false\nexpo.gif.enabled=true\nexpo.webp.enabled=true\nexpo.sqlite.enableFTS=true\n"
    );
    const sqlitePlugin = appConfig.plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-sqlite"
    );
    if (!Array.isArray(sqlitePlugin) || sqlitePlugin.length !== 2) {
      throw new TypeError("Missing SQLite configuration.");
    }
    const generate = () =>
      compileModsAsync(
        withAndroidSigning(
          withFocallyAndroid(
            withPlugins(
              {
                name: "Focally",
                slug: "focally",
                _internal: { projectRoot: process.cwd() },
              },
              [sqlitePlugin]
            )
          )
        ),
        { projectRoot: root, platforms: ["android"] }
      );
    await generate();
    const first = await readFile(gradle, "utf-8");
    await generate();
    expect(await readFile(gradle, "utf-8")).toBe(first);
    expect(
      first
        .trimEnd()
        .endsWith(
          'apply from: new File(rootProject.projectDir, "../plugins/focally-release.gradle")'
        )
    ).toBe(true);
    const props = await readFile(properties, "utf-8");
    expect(props.match(/^org.gradle.jvmargs=/gm)).toHaveLength(1);
    expect(props.match(/^android.lint.useK2Uast=false$/gm)).toHaveLength(1);
    for (const [key, value] of Object.entries({
      "org.gradle.caching": "true",
      "expo.gif.enabled": "false",
      "expo.webp.enabled": "false",
      "expo.webp.animated": "false",
      "expo.sqlite.enableFTS": "false",
    })) {
      expect(
        props.split("\n").filter((line) => line.startsWith(`${key}=`))
      ).toEqual([`${key}=${value}`]);
    }
    const theme = await AndroidConfig.Styles.readStylesXMLAsync({
      path: styles,
    });
    const splash = AndroidConfig.Styles.getStylesGroupAsObject(theme, {
      name: "Theme.App.SplashScreen",
    });
    expect(splash).not.toBeNull();
    expect(splash).not.toHaveProperty("android:windowSplashScreenBehavior");
    expect(splash?.windowSplashScreenAnimatedIcon).toBe(
      "@drawable/splashscreen_logo"
    );

    const release = await AndroidConfig.Manifest.readAndroidManifestAsync(
      join(android, "app/src/release/AndroidManifest.xml")
    );
    for (const permission of ["INTERNET", "ACCESS_NETWORK_STATE"]) {
      expect(release.manifest["uses-permission"]).toContainEqual({
        $: {
          "android:name": `android.permission.${permission}`,
          "tools:node": "remove",
        },
      });
    }
    expect(
      release.manifest.application?.[0]?.$["android:usesCleartextTraffic"]
    ).toBe("false");
    const main =
      await AndroidConfig.Manifest.readAndroidManifestAsync(manifest);
    expect(main.manifest["uses-feature"]).toContainEqual({
      $: {
        "android:name": "android.hardware.camera.autofocus",
        "android:required": "false",
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
