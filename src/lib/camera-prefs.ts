import { useSyncExternalStore } from "react";

import { usePref } from "@/hooks/use-pref";
import {
  defaults,
  parseSetting,
  parseStartup,
  preferenceDefaults,
  startupDefaults,
  startupSetting,
  restoredSetting,
} from "@/lib/camera-settings";
import type {
  CameraSettings,
  SettingKey,
  StartupKey,
  StartupValue,
  RememberKey,
} from "@/lib/camera-settings";
import { prefs } from "@/lib/prefs";

const boolean = (value: unknown) =>
  typeof value === "boolean" ? value : undefined;
export const useHaptics = () =>
  usePref("haptics", preferenceDefaults.haptics, boolean);
export const useVolumeShutter = () =>
  usePref("volumeShutter", preferenceDefaults.volumeShutter, boolean);
export const useAutoReview = () =>
  usePref("autoReview", preferenceDefaults.autoReview, boolean);
export const useAutoSave = () =>
  usePref("autoSave", preferenceDefaults.autoSave, boolean);
export const useKeepOriginal = () =>
  usePref("keepOriginal", preferenceDefaults.keepOriginal, boolean);
export const usePhotoLocationPreference = () =>
  usePref("photoLocation", preferenceDefaults.photoLocation, boolean);
export const useGalleryLayout = () =>
  usePref<"grid" | "masonry">("galleryLayout", "grid", (value) =>
    value === "grid" || value === "masonry" ? value : undefined
  );
export const useDeleteDeviceCopy = () =>
  usePref("deleteDeviceCopy", true, boolean);
const listeners = new Set<() => void>();
let current: CameraSettings | undefined;
function saved<K extends SettingKey>(key: K) {
  return prefs.get(
    `capture.${key}`,
    prefs.get(key, defaults[key], (value) => parseSetting(key, value)),
    (value) => parseSetting(key, value)
  );
}
function initialChoice<K extends StartupKey>(key: K): StartupValue<K> {
  const legacy = prefs.get(
    `remember.${key}`,
    startupDefaults[key] === "last",
    boolean
  );
  return prefs.get(`startup.${key}`, legacy ? "last" : defaults[key], (value) =>
    parseStartup(key, value)
  );
}
function snapshot() {
  current ??= {
    focalLength: startupSetting(
      "focalLength",
      initialChoice("focalLength"),
      saved("focalLength")
    ),
    ratio: startupSetting("ratio", initialChoice("ratio"), saved("ratio")),
    timer: startupSetting("timer", initialChoice("timer"), saved("timer")),
    exposure: restoredSetting(
      "exposure",
      prefs.get("remember.exposure", false, boolean),
      saved("exposure")
    ),
    flash: restoredSetting(
      "flash",
      prefs.get("remember.flash", false, boolean),
      saved("flash")
    ),
    grid: saved("grid"),
    level: saved("level"),
  };
  return current;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setCameraSetting<K extends SettingKey>(
  key: K,
  value: CameraSettings[K]
) {
  if (parseSetting(key, value) === undefined) {
    throw new Error("Invalid camera setting.");
  }
  if (snapshot()[key] === value) {
    return;
  }
  current = { ...snapshot(), [key]: value };
  if (
    (key !== "exposure" && key !== "flash") ||
    prefs.get(`remember.${key}`, false, boolean)
  ) {
    prefs.set(`capture.${key}`, value);
  }
  for (const listener of listeners) {
    listener();
  }
}
export function useCameraSettings() {
  return [
    useSyncExternalStore(subscribe, snapshot, snapshot),
    setCameraSetting,
  ] as const;
}
export function useStartup<K extends StartupKey>(key: K) {
  const [value, setValue] = usePref(
    `startup.${key}`,
    initialChoice(key),
    (raw) => parseStartup(key, raw)
  );
  const update = (choice: StartupValue<K>) => {
    setValue(choice);
    prefs.remove(`remember.${key}`);
    if (choice !== "last") {
      setCameraSetting(key, choice);
    }
  };
  return [value, update] as const;
}
export function useRemember(key: RememberKey) {
  const [value, setValue] = usePref(`remember.${key}`, false, boolean);
  const update = (enabled: boolean) => {
    const value = snapshot()[key];
    setValue(enabled);
    if (enabled) {
      prefs.set(`capture.${key}`, value);
    } else {
      prefs.remove(`capture.${key}`);
      prefs.remove(key);
    }
  };
  return [value, update] as const;
}
