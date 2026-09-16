import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { StateIcon } from "@/components/state-icon";
import { selectionFeedback } from "@/lib/haptics";
import { useTranslation } from "@/lib/i18n";
import { colors } from "@/lib/theme";

export function FavoriteButton({
  selected,
  disabled,
  onPress,
  label,
}: {
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  label?: string;
}) {
  const { t } = useTranslation();
  const scale = useSharedValue(1);
  const ring = useSharedValue(1);
  const tilt = useSharedValue(0);
  const state = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    state.value = withTiming(selected ? 1 : 0, {
      duration: 140,
      reduceMotion: ReduceMotion.System,
    });
  }, [selected, state]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${tilt.value}deg` }],
    backgroundColor: interpolateColor(
      state.value,
      [0, 1],
      [`${colors.favorite}00`, `${colors.favorite}1A`]
    ),
  }));
  const halo = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.55,
    transform: [{ scale: 0.7 + ring.value * 0.6 }],
  }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        label ?? (selected ? t("photo.favoriteRemove") : t("photo.favoriteAdd"))
      }
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => {
        selectionFeedback();
        const motion = {
          duration: 110,
          easing: Easing.out(Easing.quad),
          reduceMotion: ReduceMotion.System,
        };
        scale.value = withSequence(
          withTiming(0.82, { ...motion, duration: 65 }),
          withTiming(selected ? 1 : 1.18, { ...motion, duration: 125 }),
          withTiming(1, { ...motion, duration: 150 })
        );
        if (!selected) {
          ring.value = 0;
          ring.value = withTiming(1, { ...motion, duration: 400 });
          tilt.value = withSequence(
            withTiming(-9, { ...motion, duration: 90 }),
            withTiming(0, { ...motion, duration: 200 })
          );
        }
        onPress();
      }}
    >
      <Animated.View pointerEvents="none" style={[styles.halo, halo]} />
      <Animated.View style={[styles.button, style]}>
        <StateIcon
          name="heart"
          size={24}
          active={selected}
          activeColor={colors.favorite}
        />
      </Animated.View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  halo: {
    position: "absolute",
    width: 42,
    height: 42,
    left: 3,
    top: 3,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.favorite,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
