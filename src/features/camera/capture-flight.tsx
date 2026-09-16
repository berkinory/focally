import { Image } from "expo-image";
import { useCallback, useLayoutEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { CameraPhoto } from "@/camera";
import { createCaptureFlightLifecycle } from "@/lib/capture-flight";
import { colors } from "@/lib/theme";

export interface FlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Flight {
  photo: CameraPhoto;
  from: FlightRect;
  to: FlightRect;
}

export function CaptureFlight({
  flight,
  onComplete,
}: {
  flight: Flight;
  onComplete: () => void;
}) {
  const progress = useSharedValue(0);
  const visible = useSharedValue(0);
  const playback = useRef<ReturnType<
    typeof createCaptureFlightLifecycle
  > | null>(null);
  const latest = useRef(onComplete);
  latest.current = onComplete;
  const arrive = useCallback(() => playback.current?.arrive(), []);
  useLayoutEffect(() => {
    progress.value = 0;
    visible.value = 0;
    const session = createCaptureFlightLifecycle(
      () => {
        visible.value = 1;
        progress.value = withTiming(
          1,
          {
            duration: 420,
            easing: Easing.inOut(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          },
          (finished) => {
            if (finished === true) {
              scheduleOnRN(arrive);
            }
          }
        );
      },
      () => latest.current()
    );
    playback.current = session;
    const timeout = setTimeout(() => session.expire(), 1100);
    return () => {
      session.cancel();
      clearTimeout(timeout);
      cancelAnimation(progress);
    };
  }, [progress, visible, arrive]);
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      left: flight.from.x + (flight.to.x - flight.from.x) * p,
      top: flight.from.y + (flight.to.y - flight.from.y) * p,
      width: flight.from.width + (flight.to.width - flight.from.width) * p,
      height: flight.from.height + (flight.to.height - flight.from.height) * p,
      borderRadius: 9 + p * 4,
      opacity: visible.value,
    };
  });
  const imageStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const width = flight.from.width + (flight.to.width - flight.from.width) * p;
    const height =
      flight.from.height + (flight.to.height - flight.from.height) * p;
    return {
      transform: [
        { translateX: (width - flight.from.width) / 2 },
        { translateY: (height - flight.from.height) / 2 },
        {
          scale: Math.max(
            width / flight.from.width,
            height / flight.from.height
          ),
        },
      ],
    };
  });
  // Keep the decoded image size fixed during flight; only its clip and transform change.
  return (
    <Animated.View pointerEvents="none" style={[styles.card, style]}>
      <Animated.View
        style={[
          { width: flight.from.width, height: flight.from.height },
          imageStyle,
        ]}
      >
        <Image
          source={flight.photo.uri}
          contentFit="cover"
          onDisplay={() => playback.current?.display()}
          onError={() => {
            cancelAnimation(progress);
            visible.value = 0;
            playback.current?.fail();
          }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  card: {
    position: "absolute",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
});
