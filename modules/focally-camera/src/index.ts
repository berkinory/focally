import { requireNativeModule, requireNativeView } from "expo";
import type { NativeModule } from "expo";
import type { Ref } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";

export type FocalLength = 35 | 50 | 85;
export type PhotoRatio = "4:3" | "3:2" | "1:1";
export type FlashMode = "off" | "auto" | "on";
export type PermissionState = "granted" | "denied" | "blocked";
export interface CameraCapabilities {
  deleteDeviceCopies: boolean;
  volumeShutter: boolean;
}
export type CameraStatus =
  | "paused"
  | "starting"
  | "adjusting"
  | "ready"
  | "capturing"
  | "saving"
  | "error";
export interface CameraPhoto {
  uri: string;
  width: number;
  height: number;
  focalLength: number | null;
  capturedAt: string;
  favorite: boolean;
  size?: number;
  inGallery?: boolean;
  original?: boolean;
  privateCopy?: boolean;
  exportFailed?: boolean;
  iso?: number | null;
  exposureTime?: number | null;
  aperture?: number | null;
}
export interface CameraState {
  status: CameraStatus;
  errorCode: string | null;
  focalLength: number;
  baseFocalLength: number | null;
  cameraId: string | null;
  ratio: PhotoRatio;
  frame: { x: number; y: number; width: number; height: number } | null;
}
export interface CameraControlsState {
  exposureSupported: boolean;
  exposureMin: number;
  exposureMax: number;
  exposureStep: number;
  exposure: number;
  hasFlash: boolean;
  focusLocked: boolean;
  exposureLocked: boolean;
  lockPoint: { x: number; y: number } | null;
  settling: boolean;
}
export interface CameraHandle {
  capture(autoSave: boolean, keepOriginal: boolean): Promise<CameraPhoto>;
  unlockFocus(): Promise<void>;
}
interface CameraViewProps extends ViewProps {
  ref?: Ref<CameraHandle>;
  active: boolean;
  focalLength: FocalLength;
  focalLabel: string;
  grid: boolean;
  ratio: PhotoRatio;
  exposure: number;
  flash: FlashMode;
  level: boolean;
  volumeShutter: boolean;
  photoLocation: boolean;
  interactionLocked: boolean;
  onStatus: (event: NativeSyntheticEvent<CameraState>) => void;
  onControls: (event: NativeSyntheticEvent<CameraControlsState>) => void;
  onShutter: (event: NativeSyntheticEvent<Record<string, never>>) => void;
}
interface FocallyModule extends NativeModule {
  readonly capabilities: CameraCapabilities;
  getCameraPermission(): Promise<PermissionState>;
  requestCameraPermission(): Promise<PermissionState>;
  getLocationPermission(): Promise<PermissionState>;
  requestLocationPermission(): Promise<PermissionState>;
  getLastPhoto(): Promise<CameraPhoto | null>;
  getPhotos(
    before: string | null,
    favoritesOnly: boolean
  ): Promise<{ photos: CameraPhoto[]; nextCursor: string | null }>;
  getPhoto(uri: string): Promise<CameraPhoto | null>;
  setFavorite(uri: string, value: boolean): Promise<void>;
  deletePhoto(uri: string, deleteDeviceCopies: boolean): Promise<void>;
  sharePhoto(uri: string, title: string): Promise<void>;
  sharePhotos(uris: string[], title: string): Promise<void>;
  saveToGallery(uri: string): Promise<CameraPhoto>;
}
export const camera = requireNativeModule<FocallyModule>("FocallyCamera");
export const CameraView = requireNativeView<CameraViewProps>("FocallyCamera");
