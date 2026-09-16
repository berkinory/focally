import { BlurTargetView } from "expo-blur";
import { router, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { camera } from "@/camera";
import type { CameraPhoto } from "@/camera";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActionButton, EmptyState, IconButton } from "@/components/controls";
import { EdgeBlur } from "@/components/edge-blur";
import { Icon } from "@/components/icon";
import { DownloadButton } from "@/features/photos/download-button";
import { FavoriteButton } from "@/features/photos/favorite-button";
import { PhotoInfo } from "@/features/photos/photo-info";
import { ZoomablePhoto } from "@/features/photos/zoomable-photo";
import { useDeleteDeviceCopy } from "@/lib/camera-prefs";
import { selectionFeedback } from "@/lib/haptics";
import { useTranslation, formatDate } from "@/lib/i18n";
import { publishPhotoChange } from "@/lib/photo-changes";
import { endPhotoSession, getPhotoSession } from "@/lib/photo-session";
import type { PhotoRect } from "@/lib/photo-session";
import { colors, typography } from "@/lib/theme";

const motion = {
  duration: 210,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};
export default function PhotoScreen() {
  const { t } = useTranslation();
  const { uri, session: sessionId } = useLocalSearchParams<{
    uri?: string;
    session?: string;
  }>();
  const session = useRef(getPhotoSession(sessionId)).current;
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const mounted = useRef(true);
  const locked = useRef(false);
  const closing = useRef(false);
  const opened = useRef(false);
  const pageBusy = useRef(false);
  const [photos, setPhotos] = useState<CameraPhoto[]>(session?.photos ?? []);
  const [index, setIndex] = useState(
    Math.max(0, session?.photos.findIndex((item) => item.uri === uri) ?? 0)
  );
  const photo = photos[index];
  const photoUri = photo?.uri;
  const cursor = useRef(session?.nextCursor ?? null);
  const [loading, setLoading] = useState(photo === undefined);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteDeviceCopies, setDeleteDeviceCopies] = useDeleteDeviceCopy();
  const [origin, setOrigin] = useState<PhotoRect | null>(
    session?.origin ?? null
  );
  const progress = useSharedValue(0);
  const dismissal = useSharedValue(0);
  const blurTarget = useRef<View>(null);
  const revision = useRef(0);
  useEffect(() => {
    if (downloadNotice === 0) {
      return;
    }
    const timeout = setTimeout(() => setDownloadNotice(0), 2000);
    return () => clearTimeout(timeout);
  }, [downloadNotice]);
  const replacePhoto = (value: CameraPhoto) =>
    setPhotos((items) =>
      items.map((item) => (item.uri === value.uri ? value : item))
    );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revision.current += 1;
      if (session) {
        endPhotoSession(session.id);
      }
    };
  }, [session]);
  useEffect(() => {
    if (session) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const selected =
          uri !== undefined
            ? await camera.getPhoto(uri)
            : await camera.getLastPhoto();
        if (cancelled) {
          return;
        }
        if (!selected) {
          setUnavailable(true);
          return;
        }
        setPhotos([selected]);
        const page = await camera.getPhotos(null, false);
        if (cancelled) {
          return;
        }
        cursor.current = page.nextCursor;
        const position = page.photos.findIndex(
          (item) => item.uri === selected.uri
        );
        if (position !== -1) {
          setPhotos(
            page.photos.map((item) =>
              item.uri === selected.uri ? selected : item
            )
          );
          setIndex(position);
        }
      } catch {
        if (!cancelled) {
          setError(t("photo.openFailed"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, uri, t]);
  const revealPhoto = useCallback(() => {
    if (!opened.current && !closing.current) {
      opened.current = true;
      progress.value = withTiming(1, motion);
    }
  }, [progress]);
  useEffect(() => {
    if (!focused || photoUri === undefined) {
      return;
    }
    let cancelled = false;
    const selectedUri = photoUri;
    const refresh = async () => {
      if (locked.current) {
        return;
      }
      const token = ++revision.current;
      try {
        const result = await camera.getPhoto(selectedUri);
        if (cancelled || token !== revision.current) {
          return;
        }
        setUnavailable(result === null);
        if (result) {
          replacePhoto(result);
        }
      } catch {
        if (!cancelled && token === revision.current) {
          setError(t("photo.openFailed"));
        }
      }
    };
    void refresh();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
      }
    });
    return () => {
      cancelled = true;
      listener.remove();
    };
  }, [focused, photoUri, t]);
  useEffect(() => {
    if (
      photoUri === undefined ||
      index < photos.length - 4 ||
      cursor.current === null ||
      pageBusy.current
    ) {
      return;
    }
    pageBusy.current = true;
    void camera
      .getPhotos(cursor.current, session?.favoritesOnly ?? false)
      .then((page) => {
        if (!mounted.current) {
          return;
        }
        cursor.current = page.nextCursor;
        setPhotos((old) => [
          ...old,
          ...page.photos.filter(
            (item) => !old.some((existing) => existing.uri === item.uri)
          ),
        ]);
      })
      .catch(() => {
        if (mounted.current) {
          setError(t("gallery.loadFailed"));
        }
      })
      .finally(() => {
        pageBusy.current = false;
      });
  }, [index, photos.length, photoUri, session, t]);
  useEffect(() => {
    if (!session || photoUri === undefined) {
      return;
    }
    let cancelled = false;
    session.measure(photoUri, (rect) => {
      if (!cancelled) {
        setOrigin(rect);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [photoUri, session, width, height]);
  const finishClose = useCallback(() => router.back(), []);
  const close = useCallback(() => {
    if (closing.current) {
      return;
    }
    closing.current = true;
    progress.value = withTiming(0, { ...motion, duration: 150 }, (done) => {
      if (done === true) {
        scheduleOnRN(finishClose);
      }
    });
  }, [progress, finishClose]);
  useEffect(() => {
    if (!focused) {
      return;
    }
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showInfo) {
        setShowInfo(false);
      } else {
        close();
      }
      return true;
    });
    return () => listener.remove();
  }, [focused, showInfo, close]);
  const action = async (
    task: () => Promise<void>,
    failure: string
  ): Promise<boolean> => {
    if (locked.current || closing.current) {
      return false;
    }
    locked.current = true;
    revision.current += 1;
    setBusy(true);
    setError(null);
    try {
      await task();
      return true;
    } catch {
      if (mounted.current) {
        setDownloadNotice(0);
        setError(failure);
      }
      return false;
    } finally {
      locked.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  };
  const background = useAnimatedStyle(() => ({
    opacity:
      progress.value *
      (1 - Math.min(0.8, (dismissal.value / Math.max(1, height)) * 1.4)),
  }));
  const chrome = useAnimatedStyle(() => ({
    opacity: progress.value * (1 - Math.min(1, dismissal.value / 135)),
  }));
  const changePage = (direction: -1 | 1) => {
    if (locked.current || closing.current) {
      return;
    }
    setShowInfo(false);
    setDownloadNotice(0);
    setOrigin(null);
    setError(null);
    setUnavailable(false);
    setIndex((current) =>
      Math.max(0, Math.min(photos.length - 1, current + direction))
    );
  };
  return (
    <View style={styles.screen}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.background },
          background,
        ]}
      />
      <BlurTargetView ref={blurTarget} style={StyleSheet.absoluteFill}>
        {photo && !unavailable && (
          <ZoomablePhoto
            photo={photo}
            previous={photos[index - 1]}
            next={photos[index + 1]}
            onPage={changePage}
            onReady={revealPhoto}
            onUnavailable={() => {
              setUnavailable(true);
              revealPhoto();
            }}
            dismissEnabled={!busy && !showInfo && !confirmDelete}
            onDismiss={close}
            progress={progress}
            dismissal={dismissal}
            origin={origin}
            top={insets.top + 60}
            bottom={insets.bottom + 82}
          />
        )}
      </BlurTargetView>
      {!loading && (!photo || unavailable) && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.background },
          ]}
        >
          <EmptyState
            title={t("photo.unavailable")}
            detail={error ?? t("photo.unavailableDetail")}
          >
            <ActionButton onPress={close}>{t("common.goBack")}</ActionButton>
          </EmptyState>
        </View>
      )}
      <Animated.View
        style={[
          styles.header,
          { top: insets.top, left: insets.left, right: insets.right },
          photo ? chrome : undefined,
        ]}
      >
        <IconButton icon="back" label={t("common.back")} onPress={close} />
        <Text style={styles.title}>
          {photo
            ? formatDate(photo.capturedAt, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : t("photo.title")}
        </Text>
        <View style={styles.spacer} />
      </Animated.View>
      {photo && !unavailable && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[styles.blur, { height: insets.bottom + 106 }, chrome]}
          >
            <EdgeBlur target={blurTarget} height={insets.bottom + 106} />
          </Animated.View>
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.footer,
              {
                bottom: insets.bottom + 10,
                left: insets.left + 20,
                right: insets.right + 20,
              },
              chrome,
            ]}
          >
            <View style={styles.toolbar}>
              <FavoriteButton
                selected={photo.favorite}
                disabled={busy}
                onPress={() => {
                  const selected = photo;
                  void action(async () => {
                    const favorite = !selected.favorite;
                    replacePhoto({ ...selected, favorite });
                    try {
                      await camera.setFavorite(selected.uri, favorite);
                    } catch (error) {
                      if (mounted.current) {
                        replacePhoto(selected);
                      }
                      throw error;
                    }
                    if (session?.favoritesOnly === true && !favorite) {
                      setOrigin(null);
                    }
                    publishPhotoChange({
                      kind: "favorite",
                      uri: selected.uri,
                      favorite,
                    });
                  }, t("photo.favoriteFailed"));
                }}
              />
              <IconButton
                icon="info"
                label={t("photo.information")}
                filled={showInfo}
                onPress={() => {
                  selectionFeedback();
                  setShowInfo(!showInfo);
                }}
              />
              <DownloadButton
                disabled={busy}
                onSave={() =>
                  action(async () => {
                    const result = await camera.saveToGallery(photo.uri);
                    if (mounted.current) {
                      replacePhoto(result);
                      setDownloadNotice((notice) => notice + 1);
                    }
                  }, t("photo.downloadFailed"))
                }
              />
              <IconButton
                icon="share"
                label={t("photo.share")}
                disabled={busy}
                dimDisabled={false}
                onPress={() => {
                  selectionFeedback();
                  void action(
                    () => camera.sharePhoto(photo.uri, t("photo.share")),
                    t("photo.shareFailed")
                  );
                }}
              />
              <IconButton
                icon="trash"
                label={t("photo.delete")}
                disabled={busy}
                dimDisabled={false}
                onPress={() => {
                  selectionFeedback();
                  setConfirmDelete(true);
                }}
              />
            </View>
          </Animated.View>
          {showInfo && (
            <PhotoInfo
              photo={photo}
              bottom={insets.bottom + 88}
              onClose={() => {
                selectionFeedback();
                setShowInfo(false);
              }}
            />
          )}
          <Animated.View
            pointerEvents="none"
            style={[styles.notice, { top: insets.top + 70 }, chrome]}
          >
            {downloadNotice > 0 && (
              <Animated.View
                entering={FadeIn.duration(140).reduceMotion(
                  ReduceMotion.System
                )}
                exiting={FadeOut.duration(140).reduceMotion(
                  ReduceMotion.System
                )}
                accessibilityLiveRegion="polite"
                style={styles.noticePill}
              >
                <Text style={styles.noticeText}>{t("photo.downloaded")}</Text>
              </Animated.View>
            )}
          </Animated.View>
          {error !== null && (
            <View
              style={[styles.error, { top: insets.top + 68 }]}
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.errorText}>{error}</Text>
              <IconButton
                icon="close"
                label={t("camera.dismiss")}
                onPress={() => setError(null)}
              />
            </View>
          )}
        </>
      )}
      <ConfirmDialog
        visible={confirmDelete}
        title={t("photo.deleteTitle")}
        detail={t("photo.deletePrivateDetail")}
        cancel={t("photo.keep")}
        confirm={t("photo.deleteConfirm")}
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!photo) {
            return;
          }
          const selected = photo;
          void action(async () => {
            await camera.deletePhoto(selected.uri, deleteDeviceCopies);
            publishPhotoChange({ kind: "deleted", uri: selected.uri });
            if (mounted.current) {
              setConfirmDelete(false);
              setOrigin(null);
              close();
            }
          }, t("photo.deleteFailed"));
        }}
      >
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: deleteDeviceCopies, disabled: busy }}
          disabled={busy}
          onPress={() => {
            selectionFeedback();
            setDeleteDeviceCopies(!deleteDeviceCopies);
          }}
          style={styles.checkboxRow}
        >
          <View style={[styles.checkbox, deleteDeviceCopies && styles.checked]}>
            {deleteDeviceCopies && (
              <Icon name="check" size={16} color={colors.accent} />
            )}
          </View>
          <Text style={styles.checkboxLabel}>
            {t("photo.deleteDeviceCopies")}
          </Text>
        </Pressable>
        {error !== null && (
          <Text accessibilityLiveRegion="polite" style={styles.dialogError}>
            {error}
          </Text>
        )}
      </ConfirmDialog>
    </View>
  );
}
const styles = StyleSheet.create({
  dialogError: {
    ...typography.regular,
    color: colors.error,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  screen: { flex: 1 },
  notice: {
    position: "absolute",
    left: 20,
    right: 20,
    alignItems: "center",
  },
  noticePill: {
    backgroundColor: colors.elevated,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  noticeText: { ...typography.medium, color: colors.text, fontSize: 12 },
  header: {
    position: "absolute",
    height: 60,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    ...typography.medium,
    color: colors.text,
    fontSize: 14,
    flexShrink: 1,
    textAlign: "center",
  },
  spacer: { width: 48 },
  blur: { position: "absolute", left: 0, right: 0, bottom: 0 },
  footer: { position: "absolute", alignItems: "center" },
  toolbar: {
    width: "100%",
    maxWidth: 360,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 5,
    backgroundColor: "#202125A6",
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FFFFFF0D",
  },
  error: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingVertical: 4,
    backgroundColor: colors.elevated,
    borderRadius: 18,
  },
  errorText: {
    ...typography.regular,
    color: colors.error,
    flex: 1,
    fontSize: 12,
    lineHeight: 19,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    alignSelf: "stretch",
  },
  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: "#EAC88B16", borderColor: colors.accent },
  checkboxLabel: {
    ...typography.medium,
    color: colors.text,
    fontSize: 12,
    flexShrink: 1,
  },
});
