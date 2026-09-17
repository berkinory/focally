import { useEffect } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { PhotoRatio } from "@/camera";
import { StateIcon } from "@/components/state-icon";
import { colors, typography } from "@/lib/theme";

export function AspectGlyph({
  ratio,
  selected = false,
  size = 24,
}: {
  ratio: PhotoRatio;
  selected?: boolean;
  size?: number;
}) {
  const { width, height: windowHeight } = useWindowDimensions();
  const landscape = width > windowHeight;
  const shortSide = ratio === "3:2" ? 2 / 3 : ratio === "4:3" ? 3 / 4 : 1;
  const scale = useSharedValue(shortSide);
  useEffect(() => {
    scale.value = withTiming(shortSide, {
      duration: 140,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.System,
    });
  }, [shortSide, scale]);
  const shape = useAnimatedStyle(() => ({
    transform: [
      { scaleX: landscape ? 1 : scale.value },
      { scaleY: landscape ? scale.value : 1 },
    ],
  }));
  return (
    <Animated.View style={shape}>
      <StateIcon name="aspect" size={size} active={selected} />
    </Animated.View>
  );
}
export function AspectDockLabel({
  ratio,
  selected,
}: {
  ratio: PhotoRatio;
  selected: boolean;
}) {
  return (
    <View style={styles.dockLabel}>
      <Text
        pointerEvents="none"
        style={[styles.dockText, selected && styles.selected]}
      >
        {ratio}
      </Text>
    </View>
  );
}
export function AspectOption({
  ratio,
  selected,
}: {
  ratio: PhotoRatio;
  selected: boolean;
}) {
  return (
    <View style={styles.option}>
      <AspectGlyph ratio={ratio} selected={selected} size={19} />
      <Text style={[styles.text, selected && styles.selected]}>{ratio}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  dockLabel: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  dockText: {
    ...typography.semibold,
    fontSize: 17,
    color: colors.secondary,
    fontVariant: ["tabular-nums"],
    transform: [{ translateX: -1 }, { translateY: -2 }],
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  text: {
    ...typography.medium,
    fontSize: 11,
    color: colors.secondary,
    fontVariant: ["tabular-nums"],
  },
  selected: { color: colors.accent },
});
