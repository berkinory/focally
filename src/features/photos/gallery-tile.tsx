import { Image } from "expo-image";
import { memo, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { CameraPhoto } from "@/camera";
import { Icon } from "@/components/icon";
import { formatDate, useTranslation } from "@/lib/i18n";
import { colors } from "@/lib/theme";

export const GalleryTile = memo(
  ({
    photo,
    width,
    masonry,
    register,
    onOpen,
    selecting,
    selected,
    disabled,
    onSelect,
    onLongPress,
  }: {
    photo: CameraPhoto;
    width: number;
    masonry: boolean;
    register: (uri: string, view: View | null) => void;
    onOpen: (photo: CameraPhoto) => void;
    selecting: boolean;
    selected: boolean;
    disabled: boolean;
    onSelect: (photo: CameraPhoto) => void;
    onLongPress: (photo: CameraPhoto) => void;
  }) => {
    const { t } = useTranslation();
    const scale = useSharedValue(selected ? 0.91 : 1);
    useEffect(() => {
      scale.value = withTiming(selected ? 0.91 : 1, {
        duration: 140,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      });
    }, [selected, scale]);
    const imageStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));
    const height = masonry
      ? width *
        Math.max(0.4, Math.min(2.5, photo.height / Math.max(1, photo.width)))
      : width;
    return (
      <View
        ref={(view) => register(photo.uri, view)}
        collapsable={false}
        style={{ width, height }}
      >
        <Pressable
          accessibilityRole={selecting ? "checkbox" : "button"}
          accessibilityState={{
            checked: selecting ? selected : undefined,
            disabled,
          }}
          accessibilityHint={selecting ? undefined : t("batch.selectionHint")}
          accessibilityLabel={t(
            selecting ? "batch.selectPhoto" : "gallery.openPhoto",
            {
              date: formatDate(photo.capturedAt, {
                dateStyle: "long",
                timeStyle: "short",
              }),
            }
          )}
          disabled={disabled}
          onPress={() => (selecting ? onSelect(photo) : onOpen(photo))}
          onLongPress={() => onLongPress(photo)}
          delayLongPress={280}
          style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.image, imageStyle]}
          >
            <Image
              source={photo.uri}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={photo.uri}
              transition={0}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          {selecting && (
            <Animated.View
              pointerEvents="none"
              entering={FadeIn.duration(140).reduceMotion(ReduceMotion.System)}
              exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)}
              style={[styles.selection, selected && styles.selected]}
            >
              {selected && (
                <Icon name="check" size={14} color={colors.background} />
              )}
            </Animated.View>
          )}
          {photo.original === true && !selecting && (
            <View style={styles.original}>
              <Text style={styles.originalText}>{t("photo.original")}</Text>
            </View>
          )}
          {photo.favorite && (
            <View style={styles.favorite}>
              <Icon name="heart" size={12} color={colors.favorite} />
            </View>
          )}
        </Pressable>
      </View>
    );
  }
);
const styles = StyleSheet.create({
  image: { borderRadius: 5, overflow: "hidden" },
  selection: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#FFFFFFBB",
    backgroundColor: "#08090B80",
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 5,
    overflow: "hidden",
  },
  original: {
    position: "absolute",
    left: 4,
    top: 4,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: "#00000066",
  },
  originalText: { fontFamily: "Manrope", fontSize: 9, color: colors.text },
  favorite: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "#00000055",
    borderRadius: 12,
    padding: 4,
  },
});
