const fs = require("node:fs/promises");
const path = require("node:path");
const {
  withAndroidManifest,
  withAndroidStyles,
  withDangerousMod,
  withGradleProperties,
} = require("expo/config-plugins");

/** @type {import("expo/config-plugins").ConfigPlugin} */
module.exports = function withFocallyAndroid(config) {
  config = withAndroidStyles(config, (mod) => {
    // Expo puts an API 33-only attribute in the base theme; remove it for API 29+.
    for (const style of mod.modResults.resources.style ?? []) {
      if (style.$.name === "Theme.App.SplashScreen") {
        style.item = style.item?.filter(
          (item) => item.$.name !== "android:windowSplashScreenBehavior"
        );
      }
    }
    return mod;
  });
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest["uses-feature"] = [
      {
        $: {
          "android:name": "android.hardware.camera.any",
          "android:required": "true",
        },
      },
      {
        $: {
          "android:name": "android.hardware.camera.autofocus",
          "android:required": "false",
        },
      },
    ];
    return mod;
  });
  config = withGradleProperties(config, (mod) => {
    // AGP's K2 lint parser crashes on Worklets' .gradle.kts scripts; use K1.
    const properties = {
      "android.lint.useK2Uast": "false",
      "org.gradle.jvmargs": "-Xmx4096m -XX:MaxMetaspaceSize=1024m",
      "org.gradle.workers.max": "2",
      "org.gradle.caching": "true",
      "expo.gif.enabled": "false",
      "expo.webp.enabled": "false",
      "expo.webp.animated": "false",
    };
    mod.modResults = mod.modResults.filter(
      (item) => item.type !== "property" || !(item.key in properties)
    );
    for (const [key, value] of Object.entries(properties))
      mod.modResults.push({ type: "property", key, value });
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const src = path.join(mod.modRequest.platformProjectRoot, "app/src");
      await fs.mkdir(path.join(src, "release"), { recursive: true });
      await fs.writeFile(
        path.join(src, "release/AndroidManifest.xml"),
        `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
      <uses-permission android:name="android.permission.INTERNET" tools:node="remove"/>
      <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" tools:node="remove"/>
      <application android:usesCleartextTraffic="false" tools:replace="android:usesCleartextTraffic"/>
    </manifest>`
      );
      return mod;
    },
  ]);
};
