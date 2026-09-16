import { useEffect } from "react";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  Easing,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { CameraControlsState, FlashMode } from "@/camera";
import { AspectDockLabel, AspectOption } from "@/components/aspect-ratio";
import { Icon } from "@/components/icon";
import { SegmentedControl } from "@/components/segmented-control";
import { StateIcon } from "@/components/state-icon";
import type { CameraSettings, SettingKey } from "@/lib/camera-settings";
import { useTranslation, formatNumber } from "@/lib/i18n";
import { colors, typography } from "@/lib/theme";

import { ExposureSlider } from "./exposure-slider";

export type CameraPanel = "flash" | "timer" | "exposure" | "ratio" | null;
export const cameraDockHeight = 46;
function FlashGlyph({
  mode,
  selected = true,
}: {
  mode: FlashMode;
  selected?: boolean;
}) {
  const { t } = useTranslation();
  const enabled = useSharedValue(mode === "off" ? 0 : 1);
  const auto = useSharedValue(mode === "auto" ? 1 : 0);
  useEffect(() => {
    const timing = {
      duration: 140,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.System,
    };
    enabled.value = withTiming(mode === "off" ? 0 : 1, timing);
    auto.value = withTiming(mode === "auto" ? 1 : 0, timing);
  }, [mode, enabled, auto]);
  const offStyle = useAnimatedStyle(() => ({ opacity: 1 - enabled.value }));
  const onStyle = useAnimatedStyle(() => ({ opacity: enabled.value }));
  const badge = useAnimatedStyle(() => ({ opacity: auto.value }));
  return (
    <View style={styles.glyph}>
      <Animated.View style={[styles.iconLayer, offStyle]}>
        <Icon name="flash-off" size={21} color={colors.secondary} />
      </Animated.View>
      <Animated.View style={[styles.iconLayer, onStyle]}>
        <StateIcon name="flash" active={selected} />
      </Animated.View>
      <Animated.View style={[styles.autoBadge, badge]}>
        <Text
          style={[
            styles.autoText,
            { color: selected ? colors.accent : colors.secondary },
          ]}
        >
          {t("tools.flashAutoBadge")}
        </Text>
      </Animated.View>
    </View>
  );
}
function TimerGlyph({ timer }: { timer: 0 | 3 | 10 }) {
  useTranslation();
  const three = useSharedValue(timer === 3 ? 1 : 0);
  const ten = useSharedValue(timer === 10 ? 1 : 0);
  useEffect(() => {
    const timing = {
      duration: 140,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.System,
    };
    three.value = withTiming(timer === 3 ? 1 : 0, timing);
    ten.value = withTiming(timer === 10 ? 1 : 0, timing);
  }, [timer, three, ten]);
  const threeStyle = useAnimatedStyle(() => ({ opacity: three.value }));
  const tenStyle = useAnimatedStyle(() => ({ opacity: ten.value }));
  return (
    <View style={styles.glyph}>
      <StateIcon name="clock" active={timer !== 0} />
      <Animated.View style={[styles.timerBadge, threeStyle]}>
        <Text style={styles.timerNumber}>{formatNumber(3)}</Text>
      </Animated.View>
      <Animated.View style={[styles.timerBadge, tenStyle]}>
        <Text style={styles.timerNumber}>{formatNumber(10)}</Text>
      </Animated.View>
    </View>
  );
}
function Tool({
  label,
  children,
  open = false,
  selected = false,
  disabled,
  onPress,
}: {
  label: string;
  children: ReactNode;
  open?: boolean;
  selected?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const progress = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: 140,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.System,
    });
  }, [open, progress]);
  const background = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: open || selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tool,
        { opacity: disabled ? 0.3 : pressed ? 0.55 : 1 },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.toolSelection, background]}
      />
      {children}
    </Pressable>
  );
}
export function CameraTools({
  panel,
  onPanelChange,
  settings,
  controls,
  exposure,
  disabled,
  onChange,
  feedback,
  position,
}: {
  panel: CameraPanel;
  onPanelChange: (panel: CameraPanel) => void;
  settings: CameraSettings;
  controls: CameraControlsState;
  exposure: number;
  disabled: boolean;
  onChange: <K extends SettingKey>(key: K, value: CameraSettings[K]) => void;
  feedback: () => void;
  position: { bottom: number; right: number };
}) {
  const { t } = useTranslation();
  const available =
    (panel !== "exposure" || controls.exposureSupported) &&
    (panel !== "flash" || controls.hasFlash);
  const open = (value: CameraPanel) => {
    feedback();
    onPanelChange(panel === value ? null : value);
  };
  return (
    <View pointerEvents="box-none" style={[styles.container, position]}>
      {panel !== null && available && !disabled && (
        <Animated.View
          key={panel}
          entering={FadeIn.duration(120).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(80).reduceMotion(ReduceMotion.System)}
          style={styles.panel}
        >
          {panel === "exposure" ? (
            <ExposureSlider
              value={exposure}
              min={controls.exposureMin}
              max={controls.exposureMax}
              step={controls.exposureStep}
              onChange={(value) => onChange("exposure", value)}
            />
          ) : (
            <View style={styles.choices}>
              <Text style={styles.panelTitle}>
                {panel === "ratio"
                  ? t("tools.aspectRatio")
                  : panel === "flash"
                    ? t("tools.flash")
                    : t("tools.timer")}
              </Text>
              {panel === "flash" && (
                <SegmentedControl
                  compact
                  label={t("tools.flashMode")}
                  value={settings.flash}
                  onChange={(value) => {
                    onChange("flash", value);
                  }}
                  options={[
                    {
                      value: "off",
                      label: (
                        <FlashGlyph
                          mode="off"
                          selected={settings.flash === "off"}
                        />
                      ),
                      accessibilityLabel: t("tools.flashOff"),
                    },
                    {
                      value: "auto",
                      label: (
                        <FlashGlyph
                          mode="auto"
                          selected={settings.flash === "auto"}
                        />
                      ),
                      accessibilityLabel: t("tools.flashAuto"),
                    },
                    {
                      value: "on",
                      label: (
                        <FlashGlyph
                          mode="on"
                          selected={settings.flash === "on"}
                        />
                      ),
                      accessibilityLabel: t("tools.flashOn"),
                    },
                  ]}
                />
              )}
              {panel === "timer" && (
                <SegmentedControl
                  compact
                  label={t("tools.timer")}
                  value={settings.timer}
                  onChange={(value) => {
                    onChange("timer", value);
                  }}
                  options={[
                    {
                      value: 0,
                      label: (
                        <Icon
                          name="timer-off"
                          size={21}
                          color={
                            settings.timer === 0
                              ? colors.accent
                              : colors.secondary
                          }
                        />
                      ),
                      accessibilityLabel: t("tools.timerOff"),
                    },
                    {
                      value: 3,
                      label: t("common.secondsShort", { count: 3 }),
                      accessibilityLabel: t("common.seconds", { count: 3 }),
                    },
                    {
                      value: 10,
                      label: t("common.secondsShort", { count: 10 }),
                      accessibilityLabel: t("common.seconds", { count: 10 }),
                    },
                  ]}
                />
              )}
              {panel === "ratio" && (
                <SegmentedControl
                  compact
                  label={t("tools.aspectRatio")}
                  value={settings.ratio}
                  onChange={(value) => {
                    onChange("ratio", value);
                  }}
                  options={[
                    {
                      value: "4:3",
                      label: (
                        <AspectOption
                          ratio="4:3"
                          selected={settings.ratio === "4:3"}
                        />
                      ),
                      accessibilityLabel: t("tools.ratioSensor"),
                    },
                    {
                      value: "3:2",
                      label: (
                        <AspectOption
                          ratio="3:2"
                          selected={settings.ratio === "3:2"}
                        />
                      ),
                      accessibilityLabel: t("tools.ratioClassic"),
                    },
                    {
                      value: "1:1",
                      label: (
                        <AspectOption
                          ratio="1:1"
                          selected={settings.ratio === "1:1"}
                        />
                      ),
                      accessibilityLabel: t("tools.ratioSquare"),
                    },
                  ]}
                />
              )}
            </View>
          )}
        </Animated.View>
      )}
      <View style={styles.dock}>
        <Tool
          label={
            settings.flash === "off"
              ? t("tools.flashOff")
              : settings.flash === "auto"
                ? t("tools.flashAuto")
                : t("tools.flashOn")
          }
          open={panel === "flash"}
          selected={settings.flash !== "off"}
          disabled={disabled || !controls.hasFlash}
          onPress={() => open("flash")}
        >
          <FlashGlyph mode={settings.flash} />
        </Tool>
        <Tool
          label={
            settings.timer === 0
              ? t("tools.timerOff")
              : t("tools.timerValue", {
                  value: t("common.seconds", { count: settings.timer }),
                })
          }
          open={panel === "timer"}
          selected={settings.timer !== 0}
          disabled={disabled}
          onPress={() => open("timer")}
        >
          <TimerGlyph timer={settings.timer} />
        </Tool>
        <Tool
          label={t("tools.exposureLabel", {
            value: t("common.exposureValue", {
              value: formatNumber(exposure, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }),
            }),
          })}
          open={panel === "exposure"}
          selected={exposure !== 0}
          disabled={disabled || !controls.exposureSupported}
          onPress={() => open("exposure")}
        >
          <StateIcon
            name="exposure"
            size={22}
            active={exposure !== 0 || panel === "exposure"}
          />
        </Tool>
        <View style={styles.divider} />
        <Tool
          label={settings.grid ? t("tools.hideGrid") : t("tools.showGrid")}
          selected={settings.grid}
          disabled={disabled}
          onPress={() => {
            feedback();
            onChange("grid", !settings.grid);
          }}
        >
          <Icon
            name="grid"
            size={20}
            color={settings.grid ? colors.accent : colors.secondary}
          />
        </Tool>
        <Tool
          label={t("tools.aspectRatioValue", { ratio: settings.ratio })}
          disabled={disabled}
          open={panel === "ratio"}
          onPress={() => open("ratio")}
        >
          <AspectDockLabel
            ratio={settings.ratio}
            selected={panel === "ratio"}
          />
        </Tool>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    alignItems: "center",
    gap: 6,
  },
  dock: {
    height: cameraDockHeight,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: 23,
    backgroundColor: "rgba(20,22,25,0.94)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FFFFFF14",
  },
  tool: {
    height: 40,
    width: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  toolSelection: {
    ...StyleSheet.absoluteFill,
    borderRadius: 20,
    backgroundColor: "#FFFFFF12",
  },
  iconLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    height: 24,
    width: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  autoText: { ...typography.semibold, fontSize: 9, lineHeight: 11 },
  autoBadge: {
    position: "absolute",
    right: -2,
    top: -3,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 1,
  },
  timerBadge: {
    position: "absolute",
    right: -4,
    top: -4,
    minWidth: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    backgroundColor: colors.surface,
  },
  timerNumber: { ...typography.semibold, color: colors.accent, fontSize: 9 },
  divider: {
    height: 18,
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 3,
    backgroundColor: colors.line,
  },
  panel: {
    width: 260,
    maxWidth: "100%",
    borderRadius: 18,
    backgroundColor: "rgba(20,22,25,0.96)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FFFFFF14",
    overflow: "hidden",
  },
  choices: { padding: 6, gap: 4 },
  panelTitle: {
    ...typography.medium,
    color: colors.secondary,
    fontSize: 10,
    paddingLeft: 8,
    paddingTop: 2,
  },
});
