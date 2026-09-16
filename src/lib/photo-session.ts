import type { CameraPhoto } from "@/camera";

export interface PhotoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PhotoSession {
  id: string;
  photos: CameraPhoto[];
  nextCursor: string | null;
  favoritesOnly: boolean;
  origin: PhotoRect;
  measure: (uri: string, done: (rect: PhotoRect | null) => void) => void;
}
let current: PhotoSession | null = null;
let revision = 0;

export function startPhotoSession(session: Omit<PhotoSession, "id">) {
  current = { ...session, id: String(++revision) };
  return current.id;
}
export function getPhotoSession(id?: string) {
  return current?.id === id ? current : null;
}
export function endPhotoSession(id: string) {
  if (current?.id === id) {
    current = null;
  }
}
