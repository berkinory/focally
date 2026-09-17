import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";

import { camera } from "@/camera";
import { useTranslation } from "@/lib/i18n";

type Access = "checking" | "granted" | "denied" | "blocked";
export function useCameraAccess() {
  const { t } = useTranslation();
  const [access, setAccess] = useState<Access>("checking");
  const [foreground, setForeground] = useState(
    AppState.currentState === "active"
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const result = await camera.getCameraPermission();
        if (mounted) {
          setAccess(result);
        }
      } catch {
        if (mounted) {
          setAccess("denied");
          setError(t("camera.permissionCheckFailed"));
        }
      }
    };
    void check();
    const listener = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
      if (state === "active") {
        void check();
      }
    });
    return () => {
      mounted = false;
      listener.remove();
    };
  }, [t]);
  const request = useCallback(async () => {
    setError(null);
    try {
      if (access === "blocked") {
        await Linking.openSettings();
        return;
      }
      setAccess(await camera.requestCameraPermission());
    } catch {
      setError(t("camera.permissionOpenFailed"));
    }
  }, [access, t]);
  return { access, foreground, request, error };
}
