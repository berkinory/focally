import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { AppState, Linking, PermissionsAndroid } from "react-native";

import { usePhotoLocationPreference } from "@/lib/camera-prefs";
import { createLocationAccess } from "@/lib/location-access";

const { ACCESS_COARSE_LOCATION: coarse, ACCESS_FINE_LOCATION: fine } =
  PermissionsAndroid.PERMISSIONS;

export function usePhotoLocation() {
  const [stored, setStored] = usePhotoLocationPreference();
  const [granted, setGranted] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const focused = useRef(false);
  const access = useMemo(
    () =>
      createLocationAccess({
        check: async () =>
          (await PermissionsAndroid.check(coarse)) ||
          (await PermissionsAndroid.check(fine)),
        request: async () => {
          const result = await PermissionsAndroid.requestMultiple([
            coarse,
            fine,
          ]);
          if (result[coarse] === "granted" || result[fine] === "granted") {
            return "granted";
          }
          return result[coarse] === "never_ask_again" ? "blocked" : "denied";
        },
        openSettings: () => Linking.openSettings(),
        setEnabled: setStored,
        onPermission: setGranted,
      }),
    [setStored]
  );

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const refresh = () => {
        void access.refresh().catch(() => setFailed(true));
      };
      refresh();
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          refresh();
        }
      });
      return () => {
        focused.current = false;
        access.cancel();
        listener.remove();
        setGranted(false);
        setPending(false);
      };
    }, [access])
  );

  const change = async (enabled: boolean) => {
    setFailed(false);
    if (!enabled) {
      access.disable();
      return;
    }
    setPending(true);
    try {
      await access.enable();
    } catch {
      if (focused.current) {
        setFailed(true);
      }
    } finally {
      if (focused.current) {
        setPending(false);
      }
    }
  };
  return { enabled: stored && granted, pending, failed, change };
}
