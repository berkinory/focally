import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { BackHandler } from "react-native";

import type { CameraHandle, CameraPhoto } from "@/camera";
import { countdownRemaining } from "@/lib/camera-settings";
import { useTranslation, nativeMessage } from "@/lib/i18n";

export function useCapture(options: {
  cameraRef: RefObject<CameraHandle | null>;
  active: boolean;
  ready: boolean;
  timer: number;
  autoSave: boolean;
  keepOriginal: boolean;
  completionFeedback: () => void;
  onSaved: (photo: CameraPhoto) => void;
  feedback: () => void;
}) {
  const { t } = useTranslation();
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const deadline = useRef<number | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useCallback(() => {
    if (interval.current !== null) {
      clearInterval(interval.current);
    }
    interval.current = null;
    deadline.current = null;
    if (mounted.current) {
      setCountdown(null);
    }
  }, []);
  const take = useCallback(async () => {
    const { current } = latest;
    if (
      inFlight.current ||
      !current.ready ||
      !current.active ||
      !current.cameraRef.current
    ) {
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    current.feedback();
    try {
      const photo = await current.cameraRef.current.capture(
        current.autoSave,
        current.keepOriginal
      );
      if (mounted.current) {
        latest.current.onSaved(photo);
        latest.current.completionFeedback();
        if (photo.exportFailed === true) {
          setError(t("camera.exportFailed"));
        }
      }
    } catch (error) {
      if (mounted.current) {
        setError(
          nativeMessage(
            error !== null && typeof error === "object" && "code" in error
              ? error.code
              : null,
            "SAVE_FAILED"
          )
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setSaving(false);
      }
    }
  }, [t]);
  const request = useCallback(() => {
    if (deadline.current !== null) {
      cancel();
      return;
    }
    const { current } = latest;
    if (inFlight.current || !current.ready || !current.active) {
      return;
    }
    setError(null);
    if (current.timer === 0) {
      void take();
      return;
    }
    deadline.current = Date.now() + current.timer * 1000;
    setCountdown(current.timer);
    interval.current = setInterval(() => {
      if (!latest.current.active) {
        cancel();
        return;
      }
      if (deadline.current === null) {
        return;
      }
      const remaining = countdownRemaining(deadline.current, Date.now());
      if (remaining === 0) {
        cancel();
        if (!latest.current.ready) {
          setError(t("camera.timerNotReady"));
        } else {
          void take();
        }
      } else {
        setCountdown(remaining);
      }
    }, 100);
  }, [cancel, take, t]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [cancel]);
  useEffect(() => {
    if (!options.active || !options.ready) {
      cancel();
    }
  }, [options.active, options.ready, cancel]);
  useEffect(() => {
    if (countdown === null) {
      return;
    }
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      cancel();
      return true;
    });
    return () => listener.remove();
  }, [countdown, cancel]);
  return {
    request,
    cancel,
    countdown,
    saving,
    error,
    clearError: () => setError(null),
  };
}
