import "@/lib/i18n";
import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useReducedMotion } from "react-native-reanimated";

import { colors } from "@/lib/theme";

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.text,
    background: colors.background,
    card: colors.background,
    border: colors.line,
    text: colors.text,
  },
};
export default function RootLayout() {
  const reducedMotion = useReducedMotion();
  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ThemeProvider value={theme}>
        {/* oxlint-disable-next-line react/style-prop-object */}
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: reducedMotion ? "none" : "fade",
            animationDuration: 180,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="settings" />
          <Stack.Screen
            name="photo"
            options={{
              presentation: "transparentModal",
              animation: "none",
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
          <Stack.Screen name="gallery" />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
