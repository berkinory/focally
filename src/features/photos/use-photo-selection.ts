import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";

import { camera } from "@/camera";
import type { CameraPhoto } from "@/camera";
import { selectionFeedback } from "@/lib/haptics";
import { useTranslation } from "@/lib/i18n";
import { runPhotoBatch } from "@/lib/photo-batch";
import { publishPhotoChange, subscribePhotoChanges } from "@/lib/photo-changes";

type BatchAction = "favorite" | "download" | "delete";
export interface BatchProgress {
  kind: BatchAction | "share";
  finished: number;
  total: number;
}

export function usePhotoSelection(focused: boolean) {
  const { t } = useTranslation();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Map<string, CameraPhoto>());
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null
  );
  const alive = useRef(true);
  const selection = useRef(selected);
  const locked = useRef<BatchProgress["kind"] | null>(null);
  const stopped = useRef(false);
  const update = useCallback((next: Map<string, CameraPhoto>) => {
    selection.current = next;
    setSelected(next);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopped.current = true;
    };
  }, []);
  useEffect(
    () =>
      subscribePhotoChanges((change) => {
        const photo = selection.current.get(change.uri);
        if (!photo) {
          return;
        }
        const next = new Map(selection.current);
        if (change.kind === "deleted") {
          next.delete(change.uri);
        } else {
          next.set(change.uri, { ...photo, favorite: change.favorite });
        }
        update(next);
      }),
    [update]
  );
  useEffect(() => {
    if (notice === null || notice.error) {
      return;
    }
    const timeout = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timeout);
  }, [notice]);
  const handleBegin = useCallback(
    (photo?: CameraPhoto) => {
      if (locked.current) {
        return;
      }
      selectionFeedback();
      setNotice(null);
      setSelecting(true);
      if (photo) {
        update(new Map(selection.current).set(photo.uri, photo));
      }
    },
    [update]
  );
  const handleToggle = useCallback(
    (photo: CameraPhoto) => {
      if (locked.current) {
        return;
      }
      selectionFeedback();
      const next = new Map(selection.current);
      if (next.has(photo.uri)) {
        next.delete(photo.uri);
      } else {
        next.set(photo.uri, photo);
      }
      update(next);
    },
    [update]
  );
  const clear = useCallback(() => {
    if (locked.current === "share") {
      return false;
    }
    if (locked.current) {
      stopped.current = true;
      setStopping(true);
      return false;
    }
    update(new Map());
    setSelecting(false);
    return true;
  }, [update]);
  useEffect(() => {
    if (!focused || !selecting) {
      return;
    }
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      clear();
      return true;
    });
    return () => listener.remove();
  }, [focused, selecting, clear]);

  const run = async (kind: BatchAction, deleteDeviceCopies = false) => {
    const photos = [...selection.current.values()];
    if (locked.current || photos.length === 0) {
      return false;
    }
    locked.current = kind;
    stopped.current = false;
    setStopping(false);
    setNotice(null);
    setProgress({ kind, finished: 0, total: photos.length });
    const favorite = !photos.every((photo) => photo.favorite);
    try {
      const result = await runPhotoBatch(
        photos.map((photo) => photo.uri),
        async (uri) => {
          if (kind === "download") {
            await camera.saveToGallery(uri);
          } else if (kind === "delete") {
            await camera.deletePhoto(uri, deleteDeviceCopies);
          } else {
            await camera.setFavorite(uri, favorite);
          }
        },
        {
          shouldContinue: () => alive.current && !stopped.current,
          onSettled: (uri, succeeded, finished) => {
            if (succeeded && kind === "delete") {
              publishPhotoChange({ kind: "deleted", uri });
            } else if (succeeded && kind === "favorite") {
              publishPhotoChange({ kind: "favorite", uri, favorite });
            }
            if (alive.current) {
              setProgress({ kind, finished, total: photos.length });
            }
          },
        }
      );
      if (!alive.current) {
        return false;
      }
      const retry = new Set([...result.failed, ...result.remaining]);
      const next = new Map(
        [...selection.current].filter(([uri]) => retry.has(uri))
      );
      update(next);
      setSelecting(next.size > 0);
      const messages: string[] = [];
      if (result.completed.length > 0) {
        const key =
          kind === "download"
            ? "saved"
            : kind === "delete"
              ? "deleted"
              : favorite
                ? "favorited"
                : "unfavorited";
        messages.push(t(`batch.${key}`, { count: result.completed.length }));
        selectionFeedback();
      }
      if (result.failed.length > 0) {
        messages.push(t("batch.failed", { count: result.failed.length }));
      }
      if (result.remaining.length > 0) {
        messages.push(t("batch.stopped"));
      }
      setNotice({ text: messages.join(" "), error: result.failed.length > 0 });
      return result.completed.length === photos.length;
    } finally {
      locked.current = null;
      if (alive.current) {
        setProgress(null);
        setStopping(false);
      }
    }
  };

  const share = async () => {
    if (locked.current || selection.current.size === 0) {
      return;
    }
    const uris = [...selection.current.keys()];
    locked.current = "share";
    setNotice(null);
    setProgress({ kind: "share", finished: 0, total: uris.length });
    try {
      await camera.sharePhotos(uris, t("batch.share"));
    } catch {
      if (alive.current) {
        setNotice({ text: t("batch.shareFailed"), error: true });
      }
    } finally {
      locked.current = null;
      if (alive.current) {
        setProgress(null);
        setStopping(false);
      }
    }
  };
  return {
    selecting,
    selected,
    progress,
    stopping,
    notice,
    allFavorites:
      selected.size > 0 &&
      [...selected.values()].every((photo) => photo.favorite),
    handleBegin,
    handleToggle,
    clear,
    run,
    share,
    handleDismissNotice: () => setNotice(null),
  };
}
