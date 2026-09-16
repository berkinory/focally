import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutDown,
  ReduceMotion,
} from "react-native-reanimated";

import type { CameraPhoto } from "@/camera";
import { IconButton } from "@/components/controls";
import { useTranslation, formatDate, formatNumber } from "@/lib/i18n";
import { colors, typography } from "@/lib/theme";

export function PhotoInfo({
  photo,
  onClose,
  bottom,
}: {
  photo: CameraPhoto;
  bottom: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const optics = [
    photo.focalLength !== null && photo.focalLength > 0
      ? t("common.focalLength", { value: formatNumber(photo.focalLength) })
      : null,
    photo.iso !== undefined && photo.iso !== null && photo.iso > 0
      ? t("photo.iso", {
          value: formatNumber(photo.iso, { useGrouping: false }),
        })
      : null,
    photo.exposureTime !== undefined &&
    photo.exposureTime !== null &&
    photo.exposureTime > 0
      ? t("photo.shutter", {
          value:
            photo.exposureTime < 1
              ? `1/${formatNumber(Math.round(1 / photo.exposureTime), { useGrouping: false })}`
              : formatNumber(photo.exposureTime, { maximumFractionDigits: 1 }),
        })
      : null,
    photo.aperture !== undefined &&
    photo.aperture !== null &&
    photo.aperture > 0
      ? t("photo.aperture", {
          value: formatNumber(photo.aperture, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
        })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const summary = [
    t("photo.dimensions", {
      width: formatNumber(photo.width, { useGrouping: false }),
      height: formatNumber(photo.height, { useGrouping: false }),
    }),
    photo.size !== undefined
      ? t("photo.fileSize", {
          value: formatNumber(photo.size / 1_000_000, {
            maximumFractionDigits: 1,
            minimumFractionDigits: 1,
          }),
        })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Animated.View
      entering={FadeInDown.duration(160).reduceMotion(ReduceMotion.System)}
      exiting={FadeOutDown.duration(120).reduceMotion(ReduceMotion.System)}
      style={[styles.panel, { bottom }]}
    >
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.summary}>{summary}</Text>
        {optics !== "" && <Text style={styles.optics}>{optics}</Text>}
        <Text style={styles.date}>
          {[
            photo.original === true ? t("photo.original") : null,
            formatDate(photo.capturedAt, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </ScrollView>
      <View style={styles.close}>
        <IconButton
          icon="close"
          label={t("photo.closeInfo")}
          onPress={onClose}
        />
      </View>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 20,
    right: 20,
    maxHeight: "40%",
    overflow: "hidden",
    backgroundColor: "#202125F2",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  content: { padding: 18, paddingRight: 48, gap: 9 },
  close: { position: "absolute", right: 0, top: 0 },
  summary: {
    ...typography.medium,
    fontSize: 12,
    color: colors.text,
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
  },
  date: {
    ...typography.regular,
    fontSize: 11,
    color: colors.secondary,
    lineHeight: 18,
  },
  optics: {
    ...typography.regular,
    fontSize: 12,
    color: colors.accent,
    lineHeight: 20,
  },
});
