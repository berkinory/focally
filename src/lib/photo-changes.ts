import type { CameraPhoto } from "@/camera";

export type PhotoChange =
  | { kind: "deleted"; uri: string }
  | { kind: "favorite"; uri: string; favorite: boolean };
const listeners = new Set<(change: PhotoChange) => void>();
export function publishPhotoChange(change: PhotoChange) {
  for (const listener of listeners) {
    listener(change);
  }
}
export function subscribePhotoChanges(listener: (change: PhotoChange) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function applyPhotoChange(
  photos: CameraPhoto[],
  change: PhotoChange,
  favoritesOnly: boolean
) {
  if (change.kind === "deleted" || (favoritesOnly && !change.favorite)) {
    return photos.filter((photo) => photo.uri !== change.uri);
  }
  return photos.map((photo) =>
    photo.uri === change.uri ? { ...photo, favorite: change.favorite } : photo
  );
}
