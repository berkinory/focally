import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { Icon } from "@/components/icon";
import { selectionFeedback } from "@/lib/haptics";
import { colors, typography } from "@/lib/theme";

export function ConfirmDialog({
  visible,
  title,
  detail,
  cancel,
  confirm,
  busy,
  onCancel,
  onConfirm,
  children,
}: {
  children?: ReactNode;
  visible: boolean;
  title: string;
  detail: string;
  cancel: string;
  confirm: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const current = useRef(visible);
  current.current = visible;
  const finish = () => {
    if (!current.current) {
      setMounted(false);
    }
  };
  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
    progress.value = withTiming(
      visible ? 1 : 0,
      {
        duration: 160,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      },
      (done) => {
        if (done === true && !visible) {
          scheduleOnRN(finish);
        }
      }
    );
  }, [visible, progress]);
  const fade = useAnimatedStyle(() => ({ opacity: progress.value }));
  const card = useAnimatedStyle(() => ({
    transform: [
      { scale: 0.97 + progress.value * 0.03 },
      { translateY: (1 - progress.value) * 8 },
    ],
  }));
  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={() => {
        if (!busy) {
          onCancel();
        }
      }}
    >
      <Animated.View style={[styles.scrim, fade]}>
        <Pressable
          accessible={false}
          disabled={busy}
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View accessibilityViewIsModal style={[styles.card, card]}>
          <View style={styles.mark}>
            <Icon name="trash" color={colors.error} size={25} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.detail}>{detail}</Text>
          {children}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                selectionFeedback();
                onCancel();
              }}
              style={styles.button}
            >
              <Text style={styles.cancel}>{cancel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={() => {
                selectionFeedback();
                onConfirm();
              }}
              style={[
                styles.button,
                styles.destructive,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.confirm}>{confirm}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "#00000099",
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.elevated,
    borderRadius: 26,
    padding: 22,
    alignItems: "center",
    gap: 13,
  },
  mark: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FFC7B910",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...typography.semibold,
    fontSize: 19,
    color: colors.text,
    textAlign: "center",
  },
  detail: {
    ...typography.regular,
    fontSize: 13,
    lineHeight: 21,
    color: colors.secondary,
    textAlign: "center",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  button: {
    flex: 1,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  destructive: { backgroundColor: "#FFC7B918" },
  disabled: { opacity: 0.4 },
  cancel: { ...typography.medium, color: colors.text, fontSize: 14 },
  confirm: { ...typography.semibold, color: colors.error, fontSize: 14 },
});
