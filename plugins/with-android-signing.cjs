const { withAppBuildGradle } = require("expo/config-plugins");

const APPLY =
  'apply from: new File(rootProject.projectDir, "../plugins/focally-release.gradle")';

/** @type {import("expo/config-plugins").ConfigPlugin} */
module.exports = function withAndroidSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      throw new Error(
        "Focally signing expects the Expo Groovy Gradle template."
      );
    }
    if (!mod.modResults.contents.includes(APPLY)) {
      mod.modResults.contents += `\n${APPLY}\n`;
    }
    return mod;
  });
};
