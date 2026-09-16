import { FlashList } from "@shopify/flash-list";
import { BlurTargetView } from "expo-blur";
import { router } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { camera } from "@/camera";
import type { CameraPhoto } from "@/camera";
import { ActionButton, EmptyState, IconButton } from "@/components/controls";
import { EdgeBlur } from "@/components/edge-blur";
import { SegmentedControl } from "@/components/segmented-control";
import { GallerySelection } from "@/features/photos/gallery-selection";
import { GalleryTile } from "@/features/photos/gallery-tile";
import { usePhotoSelection } from "@/features/photos/use-photo-selection";
import { useGalleryLayout } from "@/lib/camera-prefs";
import { selectionFeedback } from "@/lib/haptics";
import { useTranslation, formatDate } from "@/lib/i18n";
import { applyPhotoChange, subscribePhotoChanges } from "@/lib/photo-changes";
import type { PhotoChange } from "@/lib/photo-changes";
import { startPhotoSession } from "@/lib/photo-session";
import type { PhotoRect } from "@/lib/photo-session";
import { colors } from "@/lib/theme";

type GalleryRow =
  | { kind: "date"; date: string; key: string }
  | { kind: "photos"; photos: CameraPhoto[]; key: string };
function rowsFor(photos: CameraPhoto[], columns: number): GalleryRow[] {
  const rows: GalleryRow[] = [];
  let date = "";
  let group: CameraPhoto[] = [];
  const flush = () => {
    const [first] = group;
    if (first !== undefined) {
      rows.push({ kind: "photos", photos: group, key: first.uri });
      group = [];
    }
  };
  for (const photo of photos) {
    const next = formatDate(photo.capturedAt, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    if (next !== date) {
      flush();
      date = next;
      rows.push({ kind: "date", date, key: `date-${photo.uri}` });
    }
    group.push(photo);
    if (group.length === columns) {
      flush();
    }
  }
  flush();
  return rows;
}
type GalleryItem =
  | GalleryRow
  | { kind: "photo"; photo: CameraPhoto; key: string };
export default function GalleryScreen() {
  const { t } = useTranslation();
  const focused = useIsFocused();
  const selection = usePhotoSelection(focused);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableWidth = width - insets.left - insets.right - 32;
  const [layout, setLayout] = useGalleryLayout();
  const masonry = layout === "masonry";
  const columns = masonry ? (availableWidth > 680 ? 3 : 2) : 4;
  const size = (availableWidth - (columns - 1) * 3) / columns;
  const [photos, setPhotos] = useState<CameraPhoto[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursor = useRef<string | null>(null);
  const busy = useRef(false);
  const opening = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const blurTarget = useRef<View>(null);
  const tiles = useRef(new Map<string, View>());
  const visibleUri = useRef<string | null>(null);
  const layoutAnchor = useRef<string | null>(null);
  const changes = useRef(new Map<string, PhotoChange>());
  const cached = useRef(new Map<boolean, CameraPhoto[]>());
  const load = useCallback(
    async (reset: boolean, pull = false) => {
      if (!reset && (busy.current || cursor.current === null)) {
        return;
      }
      const revision = reset ? ++generation.current : generation.current;
      busy.current = true;
      if (pull) {
        setRefreshing(true);
      }
      setLoading(true);
      setError(null);
      try {
        const page = await camera.getPhotos(
          reset ? null : cursor.current,
          favoritesOnly
        );
        if (!mounted.current || revision !== generation.current) {
          return;
        }
        cursor.current = page.nextCursor;
        setPhotos((old) => {
          let next = reset
            ? page.photos
            : [
                ...old,
                ...page.photos.filter(
                  (photo) => !old.some((item) => item.uri === photo.uri)
                ),
              ];
          for (const change of changes.current.values()) {
            next = applyPhotoChange(next, change, favoritesOnly);
          }
          cached.current.set(favoritesOnly, next);
          return next;
        });
      } catch {
        if (mounted.current && revision === generation.current) {
          setError(t("gallery.loadFailed"));
        }
      } finally {
        if (mounted.current && revision === generation.current) {
          busy.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [favoritesOnly, t]
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);
  useEffect(
    () =>
      subscribePhotoChanges((change) => {
        changes.current.set(change.uri, change);
        for (const [onlyFavorites, items] of cached.current) {
          cached.current.set(
            onlyFavorites,
            applyPhotoChange(items, change, onlyFavorites)
          );
        }
        setPhotos((current) =>
          applyPhotoChange(current, change, favoritesOnly)
        );
      }),
    [favoritesOnly]
  );
  useEffect(() => {
    void load(true);
  }, [load]);
  useEffect(() => {
    if (!focused) {
      return;
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void load(true);
      }
    });
    return () => subscription.remove();
  }, [focused, load]);
  const register = useCallback((uri: string, view: View | null) => {
    if (view === null) {
      tiles.current.delete(uri);
    } else {
      tiles.current.set(uri, view);
    }
  }, []);
  const measure = useCallback(
    (uri: string, done: (rect: PhotoRect | null) => void) => {
      const tile = tiles.current.get(uri);
      if (!tile) {
        done(null);
        return;
      }
      tile.measureInWindow((x, y, w, h) =>
        done(
          w > 0 &&
            h > 0 &&
            y >= insets.top + 110 &&
            y + h <= height - insets.bottom
            ? { x, y, width: w, height: h }
            : null
        )
      );
    },
    [height, insets.top, insets.bottom]
  );
  useEffect(() => {
    if (focused) {
      opening.current = false;
    }
  }, [focused]);
  const openPhoto = (photo: CameraPhoto) => {
    if (opening.current || !focused || selection.selecting) {
      return;
    }
    opening.current = true;
    measure(photo.uri, (rect) => {
      const origin = rect ?? {
        x: width / 2,
        y: height / 2,
        width: 0,
        height: 0,
      };
      const session = startPhotoSession({
        photos,
        nextCursor: cursor.current,
        favoritesOnly,
        origin,
        measure,
      });
      router.push({ pathname: "/photo", params: { uri: photo.uri, session } });
    });
  };
  const data = useMemo<GalleryItem[]>(
    () =>
      masonry
        ? photos.map((photo) => ({ kind: "photo", photo, key: photo.uri }))
        : rowsFor(photos, 4),
    [photos, masonry]
  );
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <IconButton
          icon={selection.selecting ? "close" : "back"}
          label={
            selection.selecting ? t("batch.done") : t("common.backToCamera")
          }
          disabled={selection.progress !== null}
          onPress={() => {
            if (selection.selecting) {
              selection.clear();
            } else {
              router.back();
            }
          }}
        />
        <Text numberOfLines={1} style={styles.heading}>
          {selection.selecting
            ? t("batch.selected", { count: selection.selected.size })
            : t("gallery.title")}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              selection.selecting
                ? selection.progress
                  ? t("batch.stop")
                  : t("batch.done")
                : t("batch.selectPhotos")
            }
            disabled={
              selection.stopping ||
              selection.progress?.kind === "share" ||
              (!selection.selecting && photos.length === 0)
            }
            onPress={() => {
              if (selection.selecting) {
                selectionFeedback();
                selection.clear();
              } else {
                selection.handleBegin();
              }
            }}
            style={({ pressed }) => [
              styles.selectButton,
              { opacity: pressed || selection.stopping ? 0.5 : 1 },
            ]}
          >
            <Text style={styles.selectText}>
              {selection.selecting
                ? selection.progress
                  ? t("batch.stop")
                  : t("batch.done")
                : t("batch.select")}
            </Text>
          </Pressable>
          <IconButton
            icon={masonry ? "layout-masonry" : "layout-grid"}
            label={
              masonry ? t("gallery.gridLayout") : t("gallery.masonryLayout")
            }
            disabled={selection.progress !== null}
            onPress={() => {
              selectionFeedback();
              layoutAnchor.current = visibleUri.current;
              setLayout(masonry ? "grid" : "masonry");
            }}
          />
        </View>
      </View>
      <View style={styles.tabs}>
        <SegmentedControl
          label={t("gallery.tabs")}
          value={favoritesOnly ? "favorites" : "all"}
          disabled={selection.progress !== null}
          onChange={(value) => {
            if (!selection.clear()) {
              return;
            }
            selection.handleDismissNotice();
            generation.current += 1;
            const favorites = value === "favorites";
            layoutAnchor.current = null;
            setFavoritesOnly(favorites);
            setPhotos(cached.current.get(favorites) ?? []);
            cursor.current = null;
            setLoading(true);
          }}
          options={[
            {
              value: "all",
              label: t("gallery.allPhotos"),
              accessibilityLabel: t("gallery.showAll"),
            },
            {
              value: "favorites",
              label: t("gallery.favorites"),
              accessibilityLabel: t("gallery.showFavorites"),
            },
          ]}
        />
      </View>
      <BlurTargetView ref={blurTarget} style={styles.body}>
        <Animated.View
          key={`${layout}-${favoritesOnly}`}
          entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(180).reduceMotion(ReduceMotion.System)}
          style={StyleSheet.absoluteFill}
        >
          <FlashList<GalleryItem>
            data={data}
            extraData={{
              selected: selection.selected,
              selecting: selection.selecting,
              busy: selection.progress !== null,
            }}
            initialScrollIndex={Math.max(
              0,
              data.findIndex((item) =>
                item.kind === "photo"
                  ? item.photo.uri === layoutAnchor.current
                  : item.kind === "photos" &&
                    item.photos.some(
                      (photo) => photo.uri === layoutAnchor.current
                    )
              )
            )}
            onViewableItemsChanged={({ viewableItems }) => {
              const item = viewableItems.find(
                (token) => token.item.kind !== "date"
              )?.item;
              if (item?.kind === "photo") {
                visibleUri.current = item.photo.uri;
              } else if (item?.kind === "photos") {
                visibleUri.current = item.photos[0]?.uri ?? null;
              }
            }}
            masonry={masonry}
            numColumns={masonry ? columns : 1}
            optimizeItemArrangement={false}
            keyExtractor={(item) => item.key}
            getItemType={(item) => item.kind}
            contentContainerStyle={[
              styles.list,
              selection.selecting && styles.selectingList,
            ]}
            drawDistance={height * 0.6}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                enabled={!selection.selecting}
                onRefresh={() => void load(true, true)}
                colors={[colors.secondary]}
                progressBackgroundColor={colors.surface}
              />
            }
            onEndReached={() => {
              if (photos.length > 0 && error === null) {
                void load(false);
              }
            }}
            onEndReachedThreshold={0.6}
            renderItem={({ item }) =>
              item.kind === "date" ? (
                <Text style={styles.date}>{item.date}</Text>
              ) : item.kind === "photo" ? (
                <View style={{ paddingBottom: 3 }}>
                  <GalleryTile
                    photo={item.photo}
                    width={size}
                    masonry
                    register={register}
                    onOpen={openPhoto}
                    selecting={selection.selecting}
                    selected={selection.selected.has(item.photo.uri)}
                    disabled={selection.progress !== null}
                    onSelect={selection.handleToggle}
                    onLongPress={selection.handleBegin}
                  />
                </View>
              ) : (
                <View style={styles.row}>
                  {item.photos.map((photo) => (
                    <GalleryTile
                      key={photo.uri}
                      photo={photo}
                      width={size}
                      masonry={false}
                      register={register}
                      onOpen={openPhoto}
                      selecting={selection.selecting}
                      selected={selection.selected.has(photo.uri)}
                      disabled={selection.progress !== null}
                      onSelect={selection.handleToggle}
                      onLongPress={selection.handleBegin}
                    />
                  ))}
                </View>
              )
            }
            ListEmptyComponent={
              loading ? (
                <View style={{ height: height * 0.55 }} />
              ) : (
                <EmptyState
                  icon={favoritesOnly ? "heart" : "gallery"}
                  title={
                    favoritesOnly
                      ? t("gallery.emptyFavorites")
                      : t("gallery.empty")
                  }
                  detail={
                    error ??
                    (favoritesOnly
                      ? t("gallery.emptyFavoritesDetail")
                      : t("gallery.emptyDetail"))
                  }
                  style={{ minHeight: height * 0.65 }}
                >
                  <ActionButton
                    onPress={() => {
                      if (error !== null) {
                        void load(true);
                      } else {
                        router.back();
                      }
                    }}
                  >
                    {error !== null
                      ? t("common.tryAgain")
                      : t("common.backToCamera")}
                  </ActionButton>
                </EmptyState>
              )
            }
            ListFooterComponent={
              error !== null && photos.length > 0 ? (
                <Pressable onPress={() => void load(false)}>
                  <Text style={styles.error}>{error}</Text>
                </Pressable>
              ) : null
            }
          />
        </Animated.View>
      </BlurTargetView>
      {focused && photos.length > 0 && (
        <EdgeBlur target={blurTarget} height={selection.selecting ? 100 : 40} />
      )}
      <GallerySelection selection={selection} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  header: {
    height: 60,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: {
    flex: 1,
    color: colors.text,
    fontFamily: "Manrope",
    fontSize: 16,
    fontWeight: "500",
  },
  headerActions: { flexDirection: "row", alignItems: "center" },
  selectButton: {
    minHeight: 48,
    minWidth: 58,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  selectText: {
    fontFamily: "Manrope",
    fontSize: 13,
    fontWeight: "500",
    color: colors.accent,
  },
  tabs: { marginHorizontal: 20, marginTop: 4, marginBottom: 4 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  selectingList: { paddingBottom: 130 },
  date: {
    color: colors.secondary,
    fontFamily: "Manrope",
    fontSize: 12,
    fontWeight: "500",
    paddingTop: 22,
    paddingBottom: 12,
    paddingLeft: 3,
  },
  row: { flexDirection: "row", gap: 3, marginBottom: 3 },
  error: {
    color: colors.error,
    textAlign: "center",
    fontFamily: "Manrope",
    fontSize: 13,
    padding: 24,
  },
});
