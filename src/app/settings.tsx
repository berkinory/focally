import { router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AspectOption } from "@/components/aspect-ratio";
import { IconButton } from "@/components/controls";
import { Icon } from "@/components/icon";
import type { IconName } from "@/components/icon";
import { SegmentedControl } from "@/components/segmented-control";
import { usePhotoLocation } from "@/features/camera/use-photo-location";
import {
  useCameraSettings,
  useHaptics,
  useVolumeShutter,
  useAutoReview,
  useRemember,
  useStartup,
  useAutoSave,
  useKeepOriginal,
} from "@/lib/camera-prefs";
import { selectionFeedback } from "@/lib/haptics";
import { useTranslation, formatNumber } from "@/lib/i18n";
import { colors, typography } from "@/lib/theme";

import { version, repository } from "../../package.json";

function Preference({
  icon,
  title,
  subtitle,
  value,
  onChange,
  disabled = false,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.preference}>
      <Icon name={icon} size={21} color={colors.secondary} />
      <View style={styles.preferenceCopy}>
        <Text style={styles.preferenceTitle}>{title}</Text>
        {subtitle !== undefined && (
          <Text style={styles.preferenceSubtitle}>{subtitle}</Text>
        )}
      </View>
      <Switch
        accessibilityLabel={title}
        disabled={disabled}
        value={value}
        onValueChange={(next) => {
          selectionFeedback();
          onChange(next);
        }}
        trackColor={{ false: colors.line, true: "#92794F" }}
        thumbColor={value ? colors.accent : colors.secondary}
      />
    </View>
  );
}
export default function SettingsScreen() {
  const { t } = useTranslation();
  const [linkFailed, setLinkFailed] = useState(false);
  const [autoSave, setAutoSave] = useAutoSave();
  const [keepOriginal, setKeepOriginal] = useKeepOriginal();
  const location = usePhotoLocation();
  const [settings, setSetting] = useCameraSettings();
  const [volumeShutter, setVolumeShutter] = useVolumeShutter();
  const [autoReview, setAutoReview] = useAutoReview();
  const [haptics, setHaptics] = useHaptics();
  const [focal, setFocal] = useStartup("focalLength");
  const [ratio, setRatio] = useStartup("ratio");
  const [timer, setTimer] = useStartup("timer");
  const [exposure, setExposure] = useRemember("exposure");
  const [flash, setFlash] = useRemember("flash");
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          label={t("common.backToCamera")}
          onPress={() => router.back()}
        />
        <Text style={styles.headerTitle}>{t("common.settings")}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>{t("settings.camera")}</Text>
        <View style={styles.group}>
          <Preference
            icon="grid"
            title={t("settings.composition")}
            value={settings.grid}
            onChange={(value) => setSetting("grid", value)}
          />
          <View style={styles.divider} />
          <Preference
            icon="level"
            title={t("settings.level")}
            value={settings.level}
            onChange={(value) => setSetting("level", value)}
          />
          <View style={styles.divider} />
          <Preference
            icon="volume"
            title={t("settings.volume")}
            value={volumeShutter}
            onChange={setVolumeShutter}
          />
          <View style={styles.divider} />
          <Preference
            icon="gallery"
            title={t("settings.autoReview")}
            value={autoReview}
            onChange={setAutoReview}
          />
          <View style={styles.divider} />
          <Preference
            icon="haptics"
            title={t("settings.haptics")}
            value={haptics}
            onChange={setHaptics}
          />
        </View>
        <Text style={styles.sectionLabel}>{t("settings.storage")}</Text>
        <View style={styles.group}>
          <Preference
            icon="download"
            title={t("settings.autoSave")}
            subtitle={t("settings.autoSaveDetail")}
            value={autoSave}
            onChange={setAutoSave}
          />
          <View style={styles.divider} />
          <Preference
            icon="gallery"
            title={t("settings.keepOriginal")}
            subtitle={t("settings.keepOriginalDetail")}
            value={keepOriginal}
            onChange={setKeepOriginal}
          />
          <View style={styles.divider} />
          <Preference
            icon="location"
            title={t("settings.photoLocation")}
            subtitle={
              location.failed
                ? t("settings.photoLocationFailed")
                : t("settings.photoLocationDetail")
            }
            value={location.enabled}
            disabled={location.pending}
            onChange={(value) => void location.change(value)}
          />
        </View>
        <Text style={styles.sectionLabel}>{t("settings.onLaunch")}</Text>
        <View style={styles.group}>
          <View style={styles.choice}>
            <Text style={styles.preferenceTitle}>
              {t("settings.focalLength")}
            </Text>
            <SegmentedControl
              label={t("settings.startingFocal")}
              value={focal}
              onChange={setFocal}
              options={[
                {
                  value: "last",
                  label: t("common.last"),
                  accessibilityLabel: t("settings.lastFocal"),
                },
                {
                  value: 35,
                  label: t("common.focalLength", { value: formatNumber(35) }),
                  accessibilityLabel: t("common.focalLengthLabel", {
                    value: formatNumber(35),
                  }),
                },
                {
                  value: 50,
                  label: t("common.focalLength", { value: formatNumber(50) }),
                  accessibilityLabel: t("common.focalLengthLabel", {
                    value: formatNumber(50),
                  }),
                },
                {
                  value: 85,
                  label: t("common.focalLength", { value: formatNumber(85) }),
                  accessibilityLabel: t("common.focalLengthLabel", {
                    value: formatNumber(85),
                  }),
                },
              ]}
            />
          </View>
          <View style={styles.choiceDivider} />
          <View style={styles.choice}>
            <Text style={styles.preferenceTitle}>{t("tools.aspectRatio")}</Text>
            <SegmentedControl
              label={t("settings.startingRatio")}
              value={ratio}
              onChange={setRatio}
              options={[
                {
                  value: "last",
                  label: t("common.last"),
                  accessibilityLabel: t("settings.lastRatio"),
                },
                {
                  value: "4:3",
                  label: (
                    <AspectOption ratio="4:3" selected={ratio === "4:3"} />
                  ),
                  accessibilityLabel: t("tools.ratioSensor"),
                },
                {
                  value: "3:2",
                  label: (
                    <AspectOption ratio="3:2" selected={ratio === "3:2"} />
                  ),
                  accessibilityLabel: t("tools.ratioClassic"),
                },
                {
                  value: "1:1",
                  label: (
                    <AspectOption ratio="1:1" selected={ratio === "1:1"} />
                  ),
                  accessibilityLabel: t("tools.ratioSquare"),
                },
              ]}
            />
          </View>
          <View style={styles.choiceDivider} />
          <View style={styles.choice}>
            <Text style={styles.preferenceTitle}>{t("tools.timer")}</Text>
            <SegmentedControl
              label={t("settings.startingTimer")}
              value={timer}
              onChange={setTimer}
              options={[
                {
                  value: "last",
                  label: t("common.last"),
                  accessibilityLabel: t("settings.lastTimer"),
                },
                {
                  value: 0,
                  label: t("common.off"),
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
          </View>
          <View style={styles.choiceDivider} />
          <Preference
            icon="exposure"
            title={t("tools.exposure")}
            subtitle={t("settings.keepExposure")}
            value={exposure}
            onChange={setExposure}
          />
          <View style={styles.divider} />
          <Preference
            icon="flash"
            title={t("tools.flash")}
            subtitle={t("settings.keepFlash")}
            value={flash}
            onChange={setFlash}
          />
        </View>
        <View style={styles.about}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t("settings.githubLabel")}
            onPress={() => {
              setLinkFailed(false);
              void Linking.openURL(repository.url).catch(() =>
                setLinkFailed(true)
              );
            }}
            style={({ pressed }) => [
              styles.github,
              { opacity: pressed ? 0.55 : 1 },
            ]}
          >
            <Icon name="github" size={20} color={colors.secondary} />
            <Text style={styles.githubText}>{t("settings.github")}</Text>
          </Pressable>
          {linkFailed && (
            <Text accessibilityLiveRegion="polite" style={styles.linkError}>
              {t("settings.githubFailed")}
            </Text>
          )}
          <Text style={styles.version}>
            {t("settings.version", { version })}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  headerTitle: { ...typography.semibold, color: colors.text, fontSize: 16 },
  headerSpacer: { width: 48 },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  sectionLabel: {
    ...typography.medium,
    color: colors.secondary,
    fontSize: 12,
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 14,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    overflow: "hidden",
  },
  preference: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 64,
    paddingVertical: 8,
  },
  preferenceCopy: { flex: 1, gap: 3 },
  preferenceTitle: { ...typography.medium, color: colors.text, fontSize: 14 },
  preferenceSubtitle: {
    ...typography.regular,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: 48,
  },
  choiceDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: 16,
  },
  choice: { padding: 16, gap: 12 },
  about: { alignItems: "center", paddingTop: 30, gap: 8 },
  github: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
  },
  githubText: { ...typography.medium, color: colors.secondary, fontSize: 13 },
  linkError: {
    ...typography.regular,
    color: colors.error,
    fontSize: 12,
    textAlign: "center",
  },
  version: { ...typography.regular, color: colors.muted, fontSize: 12 },
});
