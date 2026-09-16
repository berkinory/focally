import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  Easing,
  withTiming,
} from "react-native-reanimated";

import { selectionFeedback } from "@/lib/haptics";
import { colors, typography } from "@/lib/theme";

export interface SegmentOption<T> {
  value: T;
  label: ReactNode;
  accessibilityLabel: string;
}
export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled = false,
  compact = false,
  prominent = false,
}: {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  compact?: boolean;
  prominent?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const position = useSharedValue(index);
  useEffect(() => {
    position.value = withTiming(index, {
      duration: 140,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.System,
    });
  }, [index, position]);
  const cell = Math.max(0, (width - 8) / options.length);
  const selectedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * cell }],
  }));
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[
        styles.track,
        compact && styles.compactTrack,
        prominent && styles.prominentTrack,
      ]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.selected,
            compact && styles.compactSelected,
            prominent && styles.prominentSelected,
            { width: cell },
            selectedStyle,
          ]}
        />
      )}
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityLabel={option.accessibilityLabel}
          accessibilityState={{ checked: option.value === value, disabled }}
          disabled={disabled}
          onPress={() => {
            if (option.value !== value) {
              selectionFeedback();
              onChange(option.value);
            }
          }}
          style={({ pressed }) => [
            styles.option,
            compact && styles.compactOption,
            prominent && styles.prominentOption,
            { opacity: disabled ? 0.35 : pressed ? 0.55 : 1 },
          ]}
        >
          {typeof option.label === "string" ? (
            <Text
              numberOfLines={2}
              style={[
                styles.text,
                compact && styles.compactText,
                prominent && styles.prominentText,
                option.value === value && styles.activeText,
              ]}
            >
              {option.label}
            </Text>
          ) : (
            option.label
          )}
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 16,
    backgroundColor: "#0D0F12",
    position: "relative",
  },
  selected: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: colors.elevated,
    borderRadius: 12,
  },
  option: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  text: {
    ...typography.medium,
    color: colors.secondary,
    fontSize: 12,
    lineHeight: 15,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  activeText: { color: colors.accent },
  compactTrack: { borderRadius: 20 },
  compactSelected: { borderRadius: 16 },
  compactOption: { minHeight: 34 },
  compactText: { fontSize: 11 },
  prominentTrack: { borderRadius: 24 },
  prominentSelected: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FFFFFF18",
    backgroundColor: "#292A2E",
  },
  prominentOption: { minHeight: 38 },
  prominentText: { ...typography.semibold, fontSize: 14, lineHeight: 19 },
});
