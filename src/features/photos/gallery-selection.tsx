import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { IconButton } from "@/components/controls";
import { Icon } from "@/components/icon";
import { useDeleteDeviceCopy } from "@/lib/camera-prefs";
import { selectionFeedback } from "@/lib/haptics";
import { useTranslation } from "@/lib/i18n";
import { colors, typography } from "@/lib/theme";

import { DownloadButton } from "./download-button";
import { FavoriteButton } from "./favorite-button";
import type { usePhotoSelection } from "./use-photo-selection";

export function GallerySelection({
  selection,
}: {
  selection: ReturnType<typeof usePhotoSelection>;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteDeviceCopies, setDeleteDeviceCopies] = useDeleteDeviceCopy();
  const busy = selection.progress !== null;
  const disabled = busy || selection.selected.size === 0;
  return (
    <>
      {selection.selecting && (
        <Animated.View
          entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)}
          style={[
            styles.footer,
            {
              bottom: insets.bottom + 10,
              left: insets.left + 20,
              right: insets.right + 20,
            },
          ]}
        >
          {selection.progress !== null && (
            <Text accessibilityLiveRegion="polite" style={styles.progress}>
              {selection.stopping
                ? t("batch.stopping")
                : selection.progress.kind === "share"
                  ? t("batch.preparing")
                  : t("batch.progress", {
                      finished: selection.progress.finished,
                      total: selection.progress.total,
                    })}
            </Text>
          )}
          <View style={styles.toolbar}>
            <FavoriteButton
              selected={selection.allFavorites}
              disabled={disabled}
              label={
                selection.allFavorites
                  ? t("batch.favoriteRemove")
                  : t("batch.favoriteAdd")
              }
              onPress={() => {
                void selection.run("favorite");
              }}
            />
            <DownloadButton
              disabled={disabled}
              label={t("batch.download")}
              onSave={() => selection.run("download")}
            />
            <IconButton
              icon="share"
              label={t("batch.share")}
              disabled={disabled}
              onPress={() => {
                selectionFeedback();
                void selection.share();
              }}
            />
            <IconButton
              icon="trash"
              label={t("batch.delete")}
              disabled={disabled}
              onPress={() => {
                selectionFeedback();
                setConfirmDelete(true);
              }}
            />
          </View>
        </Animated.View>
      )}
      {selection.notice !== null && (
        <Animated.View
          key={selection.notice.text}
          accessibilityLiveRegion="polite"
          entering={FadeIn.duration(140).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)}
          style={[
            styles.notice,
            {
              bottom: insets.bottom + (selection.selecting ? 88 : 16),
              left: insets.left + 20,
              right: insets.right + 20,
            },
          ]}
        >
          <Text
            style={[styles.noticeText, selection.notice.error && styles.error]}
          >
            {selection.notice.text}
          </Text>
          <IconButton
            icon="close"
            size={18}
            label={t("camera.dismiss")}
            onPress={selection.handleDismissNotice}
          />
        </Animated.View>
      )}
      <ConfirmDialog
        visible={
          confirmDelete && selection.selecting && selection.selected.size > 0
        }
        title={t("batch.deleteTitle", { count: selection.selected.size })}
        detail={t("batch.deleteDetail")}
        cancel={t("photo.keep")}
        confirm={t("photo.deleteConfirm")}
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void selection.run("delete", deleteDeviceCopies);
        }}
      >
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: deleteDeviceCopies }}
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
      </ConfirmDialog>
    </>
  );
}
const styles = StyleSheet.create({
  footer: { position: "absolute", alignItems: "center", gap: 8 },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    width: "100%",
    maxWidth: 330,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "#202125F5",
  },
  progress: {
    ...typography.medium,
    fontSize: 12,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  notice: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingLeft: 16,
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  noticeText: {
    ...typography.medium,
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
    paddingVertical: 12,
  },
  error: { color: colors.error },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
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
  checked: { borderColor: colors.accent, backgroundColor: "#EAC88B18" },
  checkboxLabel: {
    ...typography.medium,
    color: colors.text,
    fontSize: 12,
    flexShrink: 1,
  },
});
