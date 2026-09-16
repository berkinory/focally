import type { FlashMode, FocalLength, PhotoRatio } from "@/camera";

export interface CameraSettings {
  focalLength: FocalLength;
  ratio: PhotoRatio;
  exposure: number;
  flash: FlashMode;
  timer: 0 | 3 | 10;
  grid: boolean;
  level: boolean;
}
export type SettingKey = keyof CameraSettings;
export type StartupKey = "focalLength" | "ratio" | "timer";
export type StartupValue<K extends StartupKey> = "last" | CameraSettings[K];
export type RememberKey = "exposure" | "flash";
export const defaults: CameraSettings = {
  focalLength: 35,
  ratio: "4:3",
  exposure: 0,
  flash: "off",
  timer: 0,
  grid: false,
  level: false,
};
export const preferenceDefaults = {
  haptics: true,
  volumeShutter: false,
  autoReview: false,
  autoSave: true,
  keepOriginal: false,
  photoLocation: false,
} as const;
export const startupDefaults: { [K in StartupKey]: StartupValue<K> } = {
  focalLength: "last",
  ratio: "4:3",
  timer: 0,
};
const parsers: {
  [K in SettingKey]: (value: unknown) => CameraSettings[K] | undefined;
} = {
  focalLength: (value) =>
    value === 35 || value === 50 || value === 85 ? value : undefined,
  ratio: (value) =>
    value === "4:3" || value === "3:2" || value === "1:1" ? value : undefined,
  exposure: (value) =>
    typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 20
      ? value
      : undefined,
  flash: (value) =>
    value === "off" || value === "auto" || value === "on" ? value : undefined,
  timer: (value) =>
    value === 0 || value === 3 || value === 10 ? value : undefined,
  grid: (value) => (typeof value === "boolean" ? value : undefined),
  level: (value) => (typeof value === "boolean" ? value : undefined),
};
export function parseSetting<K extends SettingKey>(
  key: K,
  value: unknown
): CameraSettings[K] | undefined {
  return parsers[key](value);
}
export function parseStartup<K extends StartupKey>(
  key: K,
  value: unknown
): StartupValue<K> | undefined {
  return value === "last" ? "last" : parseSetting(key, value);
}
export function startupSetting<K extends StartupKey>(
  key: K,
  choice: StartupValue<K>,
  saved: unknown
): CameraSettings[K] {
  return choice === "last"
    ? (parseSetting(key, saved) ?? defaults[key])
    : choice;
}
export function restoredSetting<K extends RememberKey>(
  key: K,
  remember: boolean,
  saved: unknown
): CameraSettings[K] {
  return remember ? (parseSetting(key, saved) ?? defaults[key]) : defaults[key];
}
export function exposureValue(
  value: number,
  min: number,
  max: number,
  step: number
) {
  if (
    ![value, min, max, step].every(Number.isFinite) ||
    step <= 0 ||
    min > max
  ) {
    return 0;
  }
  return Math.max(min, Math.min(max, Math.round(value / step) * step));
}
export function countdownRemaining(deadline: number, now: number) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
