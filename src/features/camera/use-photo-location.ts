import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { AppState, Linking } from "react-native";

import { camera } from "@/camera";
import { usePhotoLocationPreference } from "@/lib/camera-prefs";
import { createLocationAccess } from "@/lib/location-access";

export function usePhotoLocation() {
  const [stored, setStored] = usePhotoLocationPreference();
  const [granted, setGranted] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const focused = useRef(false);
  const access = useMemo(
    () =>
      createLocationAccess({
        check: async () => (await camera.getLocationPermission()) === "granted",
        request: () => camera.requestLocationPermission(),
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
