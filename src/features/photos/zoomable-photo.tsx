import { Image } from "expo-image";
import { useLayoutEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { CameraPhoto } from "@/camera";
import { useTranslation } from "@/lib/i18n";
import type { PhotoRect } from "@/lib/photo-session";

const clamp = (value: number, limit: number) => {
  "worklet";
  return Math.max(-limit, Math.min(limit, value));
};
const motion = {
  duration: 170,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};

export function ZoomablePhoto({
  photo,
  previous,
  next,
  onPage,
  onReady,
  onUnavailable,
  onDismiss,
  dismissEnabled,
  progress,
  dismissal,
  origin,
  top,
  bottom,
}: {
  photo: CameraPhoto;
  previous?: CameraPhoto;
  next?: CameraPhoto;
  onPage: (direction: -1 | 1) => void;
  onReady: () => void;
  onUnavailable: () => void;
  onDismiss: () => void;
  dismissEnabled: boolean;
  progress: SharedValue<number>;
  dismissal: SharedValue<number>;
  origin: PhotoRect | null;
  top: number;
  bottom: number;
}) {
  const { t } = useTranslation();
  const size = useWindowDimensions();
  const available = Math.max(1, size.height - top - bottom);
  const fit = Math.min(
    size.width / Math.max(1, photo.width),
    available / Math.max(1, photo.height)
  );
  const width = Math.max(1, photo.width * fit);
  const height = Math.max(1, photo.height * fit);
  const yTop = top + (available - height) / 2;
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const axis = useSharedValue(0);
  const finishing = useSharedValue(false);
  useLayoutEffect(() => {
    scale.value = 1;
    x.value = 0;
    y.value = 0;
    dismissal.value = 0;
    axis.value = 0;
    finishing.value = false;
  }, [
    photo.uri,
    size.width,
    size.height,
    scale,
    x,
    y,
    dismissal,
    axis,
    finishing,
  ]);
  const reset = () => {
    "worklet";
    dismissal.value = withTiming(0, motion);
    x.value = withTiming(0, motion);
    y.value = withTiming(0, motion);
  };
  const pinch = Gesture.Pinch()
    .enabled(dismissEnabled)
    .onStart((event) => {
      axis.value = 0;
      dismissal.value = 0;
      startScale.value = scale.value;
      startX.value = x.value;
      startY.value = y.value;
      originX.value = event.focalX - size.width / 2;
      originY.value = event.focalY - yTop - height / 2;
    })
    .onUpdate((event) => {
      const zoom = Math.max(1, Math.min(4, startScale.value * event.scale));
      const ratio = zoom / startScale.value;
      scale.value = zoom;
      x.value = clamp(
        originX.value - (originX.value - startX.value) * ratio,
        Math.max(0, (width * zoom - size.width) / 2)
      );
      y.value = clamp(
        originY.value - (originY.value - startY.value) * ratio,
        Math.max(0, (height * zoom - available) / 2)
      );
    });
  const pan = Gesture.Pan()
    .maxPointers(1)
    .enabled(dismissEnabled)
    .onStart(() => {
      axis.value = 0;
      finishing.value = false;
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((event) => {
      if (finishing.value || progress.value < 0.99) {
        return;
      }
      if (scale.value > 1.01) {
        x.value = clamp(
          startX.value + event.translationX,
          Math.max(0, (width * scale.value - size.width) / 2)
        );
        y.value = clamp(
          startY.value + event.translationY,
          Math.max(0, (height * scale.value - available) / 2)
        );
        return;
      }
      if (
        axis.value === 0 &&
        Math.max(Math.abs(event.translationX), Math.abs(event.translationY)) > 8
      ) {
        axis.value =
          Math.abs(event.translationX) > Math.abs(event.translationY) ? 1 : 2;
      }
      if (axis.value === 1) {
        const allowed =
          event.translationX < 0 ? next !== undefined : previous !== undefined;
        x.value = event.translationX * (allowed ? 1 : 0.18);
      } else if (axis.value === 2) {
        dismissal.value = Math.max(0, event.translationY);
        y.value = dismissal.value;
        x.value = event.translationX * 0.16;
      }
    })
    .onEnd((event) => {
      if (scale.value > 1.01 || finishing.value) {
        return;
      }
      if (
        axis.value === 2 &&
        (event.translationY > 95 ||
          (event.translationY > 24 && event.velocityY > 800))
      ) {
        finishing.value = true;
        scheduleOnRN(onDismiss);
        return;
      }
      const direction = event.translationX < 0 ? 1 : -1;
      const canPage =
        direction === 1 ? next !== undefined : previous !== undefined;
      if (
        axis.value === 1 &&
        canPage &&
        (Math.abs(event.translationX) > size.width * 0.2 ||
          Math.abs(event.velocityX) > 650)
      ) {
        finishing.value = true;
        x.value = withTiming(-direction * size.width, motion, (done) => {
          if (done === true) {
            scheduleOnRN(onPage, direction);
          }
        });
        return;
      }
      reset();
    })
    .onFinalize((_event, success) => {
      if (!success && !finishing.value && scale.value <= 1.01) {
        reset();
      }
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .enabled(dismissEnabled)
    .onEnd((event, success) => {
      if (!success) {
        return;
      }
      const zoom = scale.value > 1 ? 1 : 2.5;
      scale.value = withTiming(zoom, motion);
      x.value = withTiming(
        zoom === 1
          ? 0
          : clamp(
              (size.width / 2 - event.x) * (zoom - 1),
              Math.max(0, (width * zoom - size.width) / 2)
            ),
        motion
      );
      y.value = withTiming(
        zoom === 1
          ? 0
          : clamp(
              (yTop + height / 2 - event.y) * (zoom - 1),
              Math.max(0, (height * zoom - available) / 2)
            ),
        motion
      );
    });
  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <Animated.View style={StyleSheet.absoluteFill}>
        {(
          [
            [-1, previous],
            [0, photo],
            [1, next],
          ] as const
        ).map(([offset, item]) =>
          item ? (
            <PhotoPage
              key={item.uri}
              photo={item}
              offset={offset}
              viewportWidth={size.width}
              availableHeight={available}
              top={top}
              origin={origin}
              progress={progress}
              dismissal={dismissal}
              x={x}
              y={y}
              scale={scale}
              axis={axis}
              label={t("photo.zoomLabel")}
              onReady={onReady}
              onUnavailable={onUnavailable}
            />
          ) : null
        )}
      </Animated.View>
    </GestureDetector>
  );
}

function PhotoPage({
  photo,
  offset,
  viewportWidth,
  availableHeight,
  top,
  origin,
  progress,
  dismissal,
  x,
  y,
  scale,
  axis,
  label,
  onReady,
  onUnavailable,
}: {
  photo: CameraPhoto;
  offset: -1 | 0 | 1;
  viewportWidth: number;
  availableHeight: number;
  top: number;
  origin: PhotoRect | null;
  progress: SharedValue<number>;
  dismissal: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  scale: SharedValue<number>;
  axis: SharedValue<number>;
  label: string;
  onReady: () => void;
  onUnavailable: () => void;
}) {
  const fit = Math.min(
    viewportWidth / Math.max(1, photo.width),
    availableHeight / Math.max(1, photo.height)
  );
  const width = Math.max(1, photo.width * fit);
  const height = Math.max(1, photo.height * fit);
  const left = (viewportWidth - width) / 2;
  const yTop = top + (availableHeight - height) / 2;
  const current = offset === 0;
  const frame = useAnimatedStyle(() => {
    const p = current ? progress.value : 1;
    const source =
      current && origin && origin.width > 0
        ? origin
        : { x: left, y: yTop, width, height };
    return {
      left: source.x + (left - source.x) * p + offset * viewportWidth,
      top: source.y + (yTop - source.y) * p,
      width: source.width + (width - source.width) * p,
      height: source.height + (height - source.height) * p,
      borderRadius: (1 - p) * 5,
      opacity: current
        ? origin && origin.width > 0
          ? 1
          : p
        : axis.value === 1 && scale.value <= 1.01
          ? progress.value
          : 0,
      transform: [
        { translateX: x.value * p },
        { translateY: current ? y.value * p : 0 },
        {
          scale: current
            ? 1 +
              (scale.value - 1) * p -
              Math.min(0.15, dismissal.value / 2000) * p
            : 1,
        },
      ],
    };
  });
  const imageStyle = useAnimatedStyle(() => {
    const p = current ? progress.value : 1;
    const source =
      current && origin && origin.width > 0 ? origin : { width, height };
    const w = source.width + (width - source.width) * p;
    const h = source.height + (height - source.height) * p;
    return {
      transform: [
        { translateX: (w - width) / 2 },
        { translateY: (h - height) / 2 },
        { scale: Math.max(w / width, h / height) },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility={current ? "auto" : "no-hide-descendants"}
      style={[styles.frame, frame]}
    >
      <Animated.View style={[{ width, height }, imageStyle]}>
        <Image
          accessibilityLabel={label}
          onDisplay={() => {
            if (current) {
              onReady();
            }
          }}
          onError={() => {
            if (current) {
              onUnavailable();
            }
          }}
          source={photo.uri}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={0}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { position: "absolute", overflow: "hidden" },
});
