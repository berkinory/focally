import { Pressable, StyleSheet, Text, View } from "react-native";

import { StateIcon } from "@/components/state-icon";
import { selectionFeedback } from "@/lib/haptics";
import { useTranslation, formatExposure, formatNumber } from "@/lib/i18n";
import { colors, typography } from "@/lib/theme";

import { CameraRuler } from "./camera-ruler";

export function ExposureSlider(props: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("tools.resetExposure")}
          onPress={() => {
            if (props.value !== 0) {
              selectionFeedback();
            }
            props.onChange(0);
          }}
          hitSlop={6}
          style={styles.reset}
        >
          <StateIcon name="exposure" size={19} active={props.value !== 0} />
        </Pressable>
        <Text style={styles.value}>{formatExposure(props.value)}</Text>
        <Text style={styles.label}>{t("common.ev")}</Text>
      </View>
      <CameraRuler
        {...props}
        label={t("tools.exposure")}
        valueText={t("common.exposureValue", {
          value: formatNumber(props.value, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
        })}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { paddingHorizontal: 10, paddingVertical: 4 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    height: 30,
    justifyContent: "space-between",
  },
  reset: {
    width: 32,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    ...typography.medium,
    color: colors.text,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  label: {
    ...typography.medium,
    width: 32,
    textAlign: "center",
    color: colors.secondary,
    fontSize: 10,
  },
});
