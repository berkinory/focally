import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { exposureValue } from "@/lib/camera-settings";
import {
  exposureAtOffset,
  exposureOffset,
  rulerSpacing,
} from "@/lib/exposure-ruler";
import { selectionFeedback } from "@/lib/haptics";
import { colors } from "@/lib/theme";

export function CameraRuler({
  value,
  min,
  max,
  step,
  onChange,
  label,
  valueText,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  label: string;
  valueText: string;
}) {
  const scroll = useRef<ScrollView>(null);
  const interacting = useRef(false);
  const emitted = useRef(value);
  const [width, setWidth] = useState(0);
  const latest = useRef({ value, min, max, step });
  latest.current = { value, min, max, step };
  // Initial placement/range changes are separate from finger-driven values. A value
  // emitted by scrolling must never scroll the control back underneath the finger.
  useEffect(() => {
    interacting.current = false;
    const { current } = latest;
    emitted.current = current.value;
    scroll.current?.scrollTo({
      x: exposureOffset(current.value, min, max, step),
      animated: false,
    });
  }, [width, min, max, step]);
  useEffect(() => {
    if (Math.abs(value - emitted.current) < 0.001) {
      return;
    }
    interacting.current = false;
    emitted.current = value;
    scroll.current?.scrollTo({
      x: exposureOffset(value, min, max, step),
      animated: false,
    });
  }, [value, min, max, step]);
  const apply = (next: number) => {
    if (Math.abs(next - emitted.current) < 0.001) {
      return;
    }
    emitted.current = next;
    selectionFeedback();
    onChange(next);
  };
  const ticks = Math.round((max - min) / step) + 1;
  return (
    <View
      style={styles.ruler}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{
        min,
        max,
        now: value,
        text: valueText,
      }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={({ nativeEvent }) => {
        const next = exposureValue(
          value + (nativeEvent.actionName === "increment" ? step : -step),
          min,
          max,
          step
        );
        interacting.current = false;
        scroll.current?.scrollTo({
          x: exposureOffset(next, min, max, step),
          animated: false,
        });
        apply(next);
      }}
    >
      {width > 0 && (
        <ScrollView
          ref={scroll}
          horizontal
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          showsHorizontalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          decelerationRate="fast"
          snapToInterval={rulerSpacing}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingHorizontal: (width - rulerSpacing) / 2,
          }}
          onScrollBeginDrag={() => {
            interacting.current = true;
          }}
          onMomentumScrollBegin={() => {
            interacting.current = true;
          }}
          onScroll={({ nativeEvent }) => {
            if (interacting.current) {
              apply(
                exposureAtOffset(nativeEvent.contentOffset.x, min, max, step)
              );
            }
          }}
          onMomentumScrollEnd={({ nativeEvent }) => {
            if (interacting.current) {
              apply(
                exposureAtOffset(nativeEvent.contentOffset.x, min, max, step)
              );
            }
            interacting.current = false;
          }}
          onScrollEndDrag={({ nativeEvent }) => {
            if (interacting.current) {
              apply(
                exposureAtOffset(nativeEvent.contentOffset.x, min, max, step)
              );
            }
          }}
        >
          {Array.from({ length: ticks }, (_, index) => {
            const tickValue = min + index * step;
            const major = Math.abs(tickValue - Math.round(tickValue)) < 0.01;
            return (
              <View key={index} style={styles.tickCell}>
                <View
                  style={[
                    styles.tick,
                    major && styles.majorTick,
                    Math.abs(tickValue) < 0.01 && styles.zeroTick,
                  ]}
                />
              </View>
            );
          })}
        </ScrollView>
      )}
      <View pointerEvents="none" style={styles.indicator} />
    </View>
  );
}
const styles = StyleSheet.create({
  ruler: { height: 36, overflow: "hidden" },
  tickCell: {
    width: rulerSpacing,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  tick: { width: 1, height: 9, backgroundColor: "#65666B" },
  majorTick: { height: 15, backgroundColor: colors.secondary },
  zeroTick: { backgroundColor: colors.text, height: 18 },
  indicator: {
    position: "absolute",
    left: "50%",
    marginLeft: -1,
    top: 6,
    bottom: 6,
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
});
