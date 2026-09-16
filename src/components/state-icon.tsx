import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/lib/theme";

import { Icon } from "./icon";
import type { IconName } from "./icon";

export function StateIcon({
  name,
  active,
  size = 21,
  activeColor = colors.accent,
}: {
  name: IconName;
  active: boolean;
  size?: number;
  activeColor?: string;
}) {
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: 140,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.System,
    });
  }, [active, progress]);
  const inactive = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const selected = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, inactive]}>
        <Icon name={name} size={size} color={colors.secondary} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, selected]}>
        <Icon name={name} size={size} color={activeColor} />
      </Animated.View>
    </View>
  );
}
