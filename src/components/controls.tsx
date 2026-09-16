import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ViewStyle } from "react-native";

import { Icon } from "@/components/icon";
import type { IconName } from "@/components/icon";
import { colors } from "@/lib/theme";

export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  filled = false,
  dimDisabled = true,
  size = 24,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  filled?: boolean;
  dimDisabled?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: filled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        filled && styles.filled,
        {
          opacity: disabled && dimDisabled ? 0.3 : pressed ? 0.55 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}
    >
      <Icon
        name={icon}
        size={size}
        color={filled ? colors.accent : colors.text}
      />
    </Pressable>
  );
}

export function ActionButton({
  children,
  onPress,
}: {
  children: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={styles.actionText}>{children}</Text>
    </Pressable>
  );
}

export function EmptyState({
  icon = "camera",
  title,
  detail,
  children,
  style,
}: {
  icon?: IconName;
  title: string;
  detail: string;
  children?: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.empty, style]}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={30} color={colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  filled: { backgroundColor: colors.surface },
  action: {
    backgroundColor: colors.text,
    paddingHorizontal: 26,
    paddingVertical: 15,
    borderRadius: 30,
    marginTop: 12,
  },
  actionText: {
    color: colors.background,
    fontFamily: "Manrope",
    fontSize: 15,
    fontWeight: "600",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 14,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    backgroundColor: colors.surface,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: "Manrope",
    fontSize: 24,
    fontWeight: "500",
    letterSpacing: -0.7,
    textAlign: "center",
  },
  emptyDetail: {
    color: colors.secondary,
    fontFamily: "Manrope",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
    maxWidth: 290,
  },
});
