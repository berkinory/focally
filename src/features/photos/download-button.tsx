import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Icon } from "@/components/icon";
import { selectionFeedback } from "@/lib/haptics";
import { useTranslation } from "@/lib/i18n";

const motion = {
  duration: 160,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.System,
};
export function DownloadButton({
  disabled,
  onSave,
  label,
}: {
  disabled: boolean;
  onSave: () => Promise<boolean>;
  label?: string;
}) {
  const { t } = useTranslation();
  const alive = useRef(true);
  const locked = useRef(false);
  const [saving, setSaving] = useState(false);
  const travel = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelAnimation(travel);
      cancelAnimation(glow);
    };
  }, [travel, glow]);
  const icon = useAnimatedStyle(() => ({
    transform: [{ translateY: travel.value }],
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: 1 + (1 - glow.value) * 0.2 }],
  }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        saving ? t("photo.downloading") : (label ?? t("photo.download"))
      }
      accessibilityState={{ disabled: disabled || saving, busy: saving }}
      disabled={disabled || saving}
      style={styles.button}
      onPress={() => {
        if (locked.current) {
          return;
        }
        locked.current = true;
        setSaving(true);
        selectionFeedback();
        cancelAnimation(glow);
        glow.value = 0.2;
        glow.value = withRepeat(
          withTiming(0.7, {
            ...motion,
            duration: 500,
            easing: Easing.inOut(Easing.quad),
          }),
          -1,
          true
        );
        travel.value = -3;
        travel.value = withRepeat(
          withTiming(3, {
            ...motion,
            duration: 400,
            easing: Easing.inOut(Easing.quad),
          }),
          -1,
          true
        );
        let saved = false;
        void onSave()
          .then((result) => {
            saved = result;
          })
          .finally(() => {
            locked.current = false;
            cancelAnimation(travel);
            cancelAnimation(glow);
            if (!alive.current) {
              return;
            }
            travel.value = withTiming(0, motion);
            setSaving(false);
            if (saved) {
              selectionFeedback();
              glow.value = withSequence(
                withTiming(1, { ...motion, duration: 70 }),
                withTiming(0, { ...motion, duration: 330 })
              );
            } else {
              glow.value = withTiming(0, motion);
            }
          });
      }}
    >
      <Animated.View pointerEvents="none" style={[styles.ring, ring]} />
      <Animated.View style={icon}>
        <Icon name="download" size={24} />
      </Animated.View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#EAC88B66",
    backgroundColor: "#EAC88B0D",
  },
});
