import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Focally",
  slug: "focally",
  scheme: "focally",
  version: "0.0.1",
  platforms: ["android", "ios"],
  orientation: "default",
  userInterfaceStyle: "dark",
  backgroundColor: "#08090B",
  icon: "./assets/brand/icon.png",
  ios: {
    bundleIdentifier: "dev.berk.focally",
    buildNumber: "2",
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        "Focally uses the camera only to take photos on your device.",
      NSLocationWhenInUseUsageDescription:
        "Focally can add your location to photos when you enable geotagging.",
      NSPhotoLibraryAddUsageDescription:
        "Focally saves photos to your library when auto-save is enabled or you tap save.",
    },
  },
  android: {
    package: "dev.berk.focally",
    versionCode: 2,
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: "./assets/brand/adaptive-foreground.png",
      backgroundImage: "./assets/brand/background.png",
      backgroundColor: "#08090B",
      monochromeImage: "./assets/brand/monochrome.png",
    },
    permissions: [
      "android.permission.CAMERA",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
    ],
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ],
    predictiveBackGestureEnabled: true,
  },
  plugins: [
    "expo-router",
    "./plugins/with-focally-android.cjs",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#08090B",
        image: "./assets/brand/mark.png",
        imageWidth: 200,
        resizeMode: "contain",
      },
    ],
    [
      "expo-font",
      {
        android: {
          fonts: [
            {
              fontFamily: "Manrope",
              fontDefinitions: [
                {
                  path: "./node_modules/@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf",
                  weight: 400,
                },
                {
                  path: "./node_modules/@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf",
                  weight: 500,
                },
                {
                  path: "./node_modules/@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf",
                  weight: 600,
                },
              ],
            },
          ],
        },
        ios: {
          fonts: [
            "./node_modules/@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf",
            "./node_modules/@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf",
            "./node_modules/@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf",
          ],
        },
      },
    ],
    ["expo-sqlite", { enableFTS: false }],
    "./plugins/with-android-signing.cjs",
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
};

export default config;
