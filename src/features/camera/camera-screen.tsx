import { Image } from "expo-image";
import { router } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { camera, CameraView } from "@/camera";
import type {
  CameraHandle,
  CameraPhoto,
  CameraState,
  FocalLength,
  CameraControlsState,
} from "@/camera";
import { ActionButton, EmptyState, IconButton } from "@/components/controls";
import { Icon } from "@/components/icon";
import { SegmentedControl } from "@/components/segmented-control";
import { useCameraAccess } from "@/features/camera/use-camera-access";
import {
  useCameraSettings,
  useVolumeShutter,
  useAutoReview,
  useAutoSave,
  useKeepOriginal,
} from "@/lib/camera-prefs";
import { exposureValue } from "@/lib/camera-settings";
import { selectionFeedback, captureFeedback } from "@/lib/haptics";
import { useTranslation, nativeMessage, formatNumber } from "@/lib/i18n";
import { colors } from "@/lib/theme";

import { CameraTools, cameraDockHeight } from "./camera-tools";
import type { CameraPanel } from "./camera-tools";
import { CaptureFlight } from "./capture-flight";
import type { Flight } from "./capture-flight";
import { useCapture } from "./use-capture";
import { usePhotoLocation } from "./use-photo-location";

const focalLengths: FocalLength[] = [35, 50, 85];
const initialState: CameraState = {
  status: "starting",
  errorCode: null,
  focalLength: 35,
  baseFocalLength: null,
  cameraId: null,
  ratio: "4:3",
  frame: null,
};

const initialControls: CameraControlsState = {
  exposureSupported: false,
  exposureMin: 0,
  exposureMax: 0,
  exposureStep: 0,
  exposure: 0,
  hasFlash: false,
  focusLocked: false,
  exposureLocked: false,
  lockPoint: null,
  settling: false,
};
export function CameraScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const focused = useIsFocused();
  const {
    access,
    foreground,
    request,
    error: permissionError,
  } = useCameraAccess();
  const [settings, setSetting] = useCameraSettings();
  const { focalLength, ratio, grid, level, flash, timer } = settings;
  const [volumeShutter] = useVolumeShutter();
  const [autoReview] = useAutoReview();
  const [controls, setControls] = useState(initialControls);
  const [panel, setPanel] = useState<CameraPanel>(null);
  const [controlsLayout, setControlsLayout] = useState({ width: 0, height: 0 });
  const ev = exposureValue(
    settings.exposure,
    controls.exposureMin,
    controls.exposureMax,
    controls.exposureStep
  );
  const [autoSave] = useAutoSave();
  const [keepOriginal] = useKeepOriginal();
  const { enabled: photoLocation } = usePhotoLocation();
  const [flight, setFlight] = useState<Flight | null>(null);
  const [preparingFlight, setPreparingFlight] = useState(false);
  const flightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenRef = useRef<View>(null);
  const viewfinderRef = useRef<View>(null);
  const thumbnailRef = useRef<View>(null);
  const alive = useRef(true);
  const flightRevision = useRef(0);
  const thumbnailReady = useRef<string | null>(null);
  const thumbnailRevision = useRef(0);
  const landed = useRef<CameraPhoto | null>(null);
  const pendingPhoto = useRef<CameraPhoto | null>(null);
  const [state, setState] = useState(initialState);
  const [photo, setPhoto] = useState<CameraPhoto | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cameraRef = useRef<CameraHandle>(null);
  const active = access === "granted" && foreground && focused && initialized;
  const nativeBusy = ["capturing", "saving"].includes(state.status);
  const ready =
    active &&
    state.status === "ready" &&
    state.focalLength === focalLength &&
    state.ratio === ratio &&
    !controls.settling &&
    (!controls.exposureSupported || Math.abs(controls.exposure - ev) < 0.001);
  const feedback = selectionFeedback;
  const live = useRef({ active, autoReview });
  live.current = { active, autoReview };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      flightRevision.current += 1;
      if (flightTimer.current !== null) {
        clearTimeout(flightTimer.current);
      }
    };
  }, []);
  const finishPhoto = (result: CameraPhoto) => {
    if (!alive.current) {
      return;
    }
    if (flightTimer.current !== null) {
      clearTimeout(flightTimer.current);
    }
    landed.current = null;
    pendingPhoto.current = null;
    setPreparingFlight(false);
    setPhoto(result);
    setFlight(null);
    if (live.current.autoReview && live.current.active) {
      router.push({ pathname: "/photo", params: { uri: result.uri } });
    }
  };
  const finishFlight = (result: CameraPhoto) => {
    if (!alive.current || pendingPhoto.current?.uri !== result.uri) {
      return;
    }
    if (thumbnailReady.current === result.uri) {
      finishPhoto(result);
      return;
    }
    // Keep the landed card until the thumbnail underneath has actually displayed.
    landed.current = result;
    setPhoto(result);
    flightTimer.current = setTimeout(() => finishPhoto(result), 700);
  };
  const animatePhoto = (result: CameraPhoto) => {
    thumbnailRevision.current += 1;
    pendingPhoto.current = result;
    const { frame } = state;
    const token = ++flightRevision.current;
    if (
      !live.current.active ||
      !frame ||
      !screenRef.current ||
      !viewfinderRef.current ||
      !thumbnailRef.current
    ) {
      finishPhoto(result);
      return;
    }
    setPreparingFlight(true);
    flightTimer.current = setTimeout(() => {
      if (alive.current && token === flightRevision.current) {
        flightRevision.current += 1;
        finishPhoto(result);
      }
    }, 250);
    screenRef.current.measureInWindow((sx, sy) => {
      viewfinderRef.current?.measureInWindow((vx, vy, vw, vh) => {
        thumbnailRef.current?.measureInWindow((tx, ty, tw, th) => {
          if (!alive.current || token !== flightRevision.current) {
            return;
          }
          if (!live.current.active || tw === 0 || vw === 0) {
            finishPhoto(result);
            return;
          }
          if (flightTimer.current !== null) {
            clearTimeout(flightTimer.current);
          }
          setPreparingFlight(false);
          setFlight({
            photo: result,
            from: {
              x: vx - sx + frame.x * vw,
              y: vy - sy + frame.y * vh,
              width: frame.width * vw,
              height: frame.height * vh,
            },
            to: { x: tx - sx, y: ty - sy, width: tw, height: th },
          });
        });
      });
    });
  };
  const capture = useCapture({
    cameraRef,
    active,
    ready: ready && flight === null && !preparingFlight,
    timer,
    feedback: captureFeedback,
    completionFeedback: captureFeedback,
    autoSave,
    keepOriginal,
    onSaved: animatePhoto,
  });
  const {
    saving,
    countdown,
    cancel: cancelCapture,
    request: handleShutter,
  } = capture;
  const busy =
    saving ||
    nativeBusy ||
    countdown !== null ||
    flight !== null ||
    preparingFlight;
  useEffect(() => {
    cancelCapture();
    setPanel(null);
    setFlight(null);
    setPreparingFlight(false);
    if (pendingPhoto.current !== null) {
      setPhoto(pendingPhoto.current);
      pendingPhoto.current = null;
    }
    if (flightTimer.current !== null) {
      clearTimeout(flightTimer.current);
    }
    landed.current = null;
    flightRevision.current += 1;
  }, [landscape, active, cancelCapture]);
  useEffect(() => {
    if (!focused || !foreground) {
      return;
    }
    let cancelled = false;
    const revision = thumbnailRevision.current;
    camera
      .getLastPhoto()
      .then((last) => {
        if (!cancelled) {
          // A refresh must not replace either the flying photo or a newer capture.
          if (
            revision === thumbnailRevision.current &&
            pendingPhoto.current === null
          ) {
            setPhoto(last);
          }
          setInitialized(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("camera.photosFailed"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [focused, foreground, attempt, t]);

  const selectFocalLength = (value: FocalLength) => {
    if (busy || value === focalLength) {
      return;
    }
    setSetting("focalLength", value);
    setError(null);
    capture.clearError();
  };
  const restart = () => {
    setError(null);
    setState(initialState);
    setControls(initialControls);
    setAttempt((value) => value + 1);
  };
  const nativeError =
    state.status === "error" ? nativeMessage(state.errorCode) : null;
  const message = error ?? capture.error ?? nativeError ?? permissionError;

  const lenses = (
    <View style={styles.lenses}>
      <SegmentedControl
        compact
        prominent
        label={t("settings.focalLength")}
        value={focalLength}
        disabled={busy}
        onChange={selectFocalLength}
        options={focalLengths.map((value) => ({
          value,
          label: t("common.focalLength", { value: formatNumber(value) }),
          accessibilityLabel: t("common.focalLengthLabel", {
            value: formatNumber(value),
          }),
        }))}
      />
    </View>
  );
  const shutter = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        countdown !== null ? t("camera.cancelTimer") : t("camera.takePhoto")
      }
      accessibilityState={{
        disabled:
          (!ready || saving || flight !== null || preparingFlight) &&
          countdown === null,
        busy,
      }}
      disabled={
        (!ready || saving || flight !== null || preparingFlight) &&
        countdown === null
      }
      onPress={handleShutter}
      style={({ pressed }) => [
        styles.shutter,
        {
          opacity: active ? 1 : 0.35,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}
    >
      <View style={[styles.shutterInside, busy && styles.shutterWaiting]}>
        {countdown !== null ? (
          <Icon name="close" color={colors.background} />
        ) : saving ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : null}
      </View>
    </Pressable>
  );
  const thumbnail = (
    <Pressable
      accessibilityRole="button"
      ref={thumbnailRef}
      accessibilityLabel={t("camera.openGallery")}
      disabled={busy}
      onPress={() => router.push("/gallery")}
      style={({ pressed }) => [
        styles.thumbnail,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      {photo ? (
        <Image
          source={photo.uri}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          onDisplay={() => {
            thumbnailReady.current = photo.uri;
            if (landed.current?.uri === photo.uri) {
              finishPhoto(landed.current);
            }
          }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Icon name="camera" size={22} color={colors.muted} />
      )}
    </Pressable>
  );

  return (
    <View
      ref={screenRef}
      collapsable={false}
      style={[
        styles.screen,
        {
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 10),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <View style={[styles.body, landscape && styles.landscapeBody]}>
        <View ref={viewfinderRef} collapsable={false} style={styles.viewfinder}>
          {access === "granted" && initialized ? (
            <CameraView
              key={attempt}
              ref={cameraRef}
              active={active}
              focalLength={focalLength}
              focalLabel={t("common.focalLength", {
                value: formatNumber(focalLength),
              })}
              grid={grid}
              ratio={ratio}
              interactionLocked={busy}
              exposure={settings.exposure}
              flash={flash}
              level={level}
              volumeShutter={volumeShutter}
              photoLocation={photoLocation}
              onControls={({ nativeEvent }) => setControls(nativeEvent)}
              onShutter={handleShutter}
              onStatus={({ nativeEvent }) => setState(nativeEvent)}
              style={StyleSheet.absoluteFill}
            />
          ) : access === "checking" ||
            (access === "granted" && error === null) ? (
            <View style={styles.loader} />
          ) : (
            <EmptyState
              title={t("camera.permissionTitle")}
              detail={
                access === "blocked"
                  ? t("camera.permissionBlocked")
                  : t("camera.permissionRequest")
              }
            >
              <ActionButton onPress={() => void request()}>
                {access === "blocked"
                  ? t("camera.openSettings")
                  : t("camera.enableCamera")}
              </ActionButton>
            </EmptyState>
          )}
          {active && controls.lockPoint !== null && (
            <View
              pointerEvents="none"
              style={[
                styles.lockMarker,
                {
                  left: `${controls.lockPoint.x * 100}%`,
                  top: `${controls.lockPoint.y * 100}%`,
                },
              ]}
            >
              <Icon name="lock" size={14} color={colors.accent} />
            </View>
          )}
          {active &&
            (controls.focusLocked || controls.exposureLocked) &&
            panel === null && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("camera.unlock")}
                disabled={busy}
                onPress={() => {
                  void cameraRef.current
                    ?.unlockFocus()
                    .catch(() => setError(t("camera.unlockFailed")));
                }}
                style={styles.focusLock}
              >
                <Icon name="lock" size={12} color={colors.accent} />
                <Text style={styles.focusLockText}>
                  {controls.focusLocked
                    ? controls.exposureLocked
                      ? t("camera.afAeLock")
                      : t("camera.afLock")
                    : t("camera.aeLock")}
                </Text>
              </Pressable>
            )}
          {countdown !== null && (
            <View pointerEvents="none" style={styles.countdown}>
              <Text style={styles.countdownNumber}>
                {formatNumber(countdown)}
              </Text>
            </View>
          )}
          {message !== null && (
            <View style={styles.message} accessibilityLiveRegion="polite">
              <Text style={styles.messageText}>{message}</Text>
              {nativeError !== null || !initialized ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={restart}
                  style={styles.retry}
                >
                  <Text style={styles.retryText}>{t("camera.restart")}</Text>
                </Pressable>
              ) : (
                <IconButton
                  icon="close"
                  label={t("camera.dismiss")}
                  onPress={() => {
                    setError(null);
                    capture.clearError();
                  }}
                />
              )}
            </View>
          )}
        </View>
        <View
          onLayout={({ nativeEvent: { layout } }) => {
            setControlsLayout((previous) =>
              previous.width === layout.width &&
              previous.height === layout.height
                ? previous
                : { width: layout.width, height: layout.height }
            );
          }}
          style={[styles.controls, landscape && styles.landscapeControls]}
        >
          {lenses}
          <View
            style={[styles.captureRow, landscape && styles.landscapeCaptureRow]}
          >
            {thumbnail}
            {shutter}
            <IconButton
              icon="settings"
              size={27}
              label={t("common.settings")}
              disabled={busy}
              onPress={() => router.push("/settings")}
            />
          </View>
          <View style={styles.status} />
        </View>
        {active && controlsLayout.height > 0 && (
          <CameraTools
            position={{
              bottom: landscape
                ? 8
                : controlsLayout.height - cameraDockHeight / 2,
              right: landscape ? controlsLayout.width + 12 : 12,
            }}
            panel={panel}
            onPanelChange={setPanel}
            settings={settings}
            controls={controls}
            exposure={ev}
            disabled={busy}
            onChange={setSetting}
            feedback={feedback}
          />
        )}
      </View>
      {flight !== null && (
        <CaptureFlight
          key={flight.photo.uri}
          flight={flight}
          onComplete={() => finishFlight(flight.photo)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lockMarker: {
    position: "absolute",
    width: 14,
    height: 14,
    marginLeft: -7,
    marginTop: -7,
  },
  focusLock: {
    position: "absolute",
    bottom: 58,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(18,19,22,0.86)",
    borderRadius: 20,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  focusLockText: {
    color: colors.accent,
    fontFamily: "Manrope",
    fontSize: 10,
    letterSpacing: 1,
  },
  countdown: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  countdownNumber: {
    color: colors.text,
    fontFamily: "Manrope",
    fontSize: 80,
    fontWeight: "400",
    fontVariant: ["tabular-nums"],
    textShadowColor: "#00000088",
    textShadowRadius: 14,
  },
  screen: { flex: 1, backgroundColor: colors.surface },
  body: { flex: 1 },
  landscapeBody: { flexDirection: "row" },
  viewfinder: { flex: 1, overflow: "hidden", position: "relative" },
  loader: { flex: 1 },
  controls: {
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 34,
    paddingBottom: 2,
    gap: 12,
  },
  landscapeControls: {
    width: 232,
    paddingHorizontal: 16,
    paddingTop: 12,
    justifyContent: "center",
    gap: 18,
  },
  lenses: { width: 236, maxWidth: "100%" },
  captureRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  landscapeCaptureRow: { gap: 12 },
  shutter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 2,
    borderColor: colors.text,
    padding: 5,
  },
  shutterInside: {
    flex: 1,
    borderRadius: 36,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterWaiting: { backgroundColor: "#727375" },
  thumbnail: {
    height: 46,
    width: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  status: { height: 18, flexDirection: "row", alignItems: "center", gap: 5 },
  statusText: { color: colors.secondary, fontFamily: "Manrope", fontSize: 11 },
  message: {
    position: "absolute",
    bottom: 18,
    left: 18,
    right: 18,
    backgroundColor: colors.elevated,
    borderRadius: 18,
    paddingLeft: 18,
    paddingVertical: 10,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  messageText: {
    flex: 1,
    fontFamily: "Manrope",
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
  retry: { padding: 12 },
  retryText: {
    color: colors.accent,
    fontFamily: "Manrope",
    fontSize: 12,
    fontWeight: "600",
  },
});
