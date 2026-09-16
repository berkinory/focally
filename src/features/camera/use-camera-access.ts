import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, PermissionsAndroid } from "react-native";

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
        const allowed = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        if (mounted) {
          setAccess((previous) =>
            allowed ? "granted" : previous === "blocked" ? "blocked" : "denied"
          );
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
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA
      );
      setAccess(
        result === "granted"
          ? "granted"
          : result === "never_ask_again"
            ? "blocked"
            : "denied"
      );
    } catch {
      setError(t("camera.permissionOpenFailed"));
    }
  }, [access, t]);
  return { access, foreground, request, error };
}
