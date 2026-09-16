import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { RefObject } from "react";
import { StyleSheet, View } from "react-native";

export function EdgeBlur({
  target,
  height = 96,
}: {
  target: RefObject<View | null>;
  height?: number;
}) {
  return (
    <View pointerEvents="none" style={[styles.edge, { height }]}>
      <MaskedView
        androidRenderingMode="hardware"
        style={StyleSheet.absoluteFill}
        maskElement={
          <LinearGradient
            colors={["#00000000", "#00000099", "#000000"]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <BlurView
          blurTarget={target}
          blurMethod="dimezisBlurViewSdk31Plus"
          tint="dark"
          intensity={24}
          style={StyleSheet.absoluteFill}
        />
      </MaskedView>
      <LinearGradient
        colors={["#08090B00", "#08090B77"]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  edge: { position: "absolute", bottom: 0, left: 0, right: 0 },
});
