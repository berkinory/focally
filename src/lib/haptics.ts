import * as Haptics from "expo-haptics";

import { prefs } from "@/lib/prefs";

let lastSelection = 0;
function enabled() {
  return prefs.get("haptics", true, (value) =>
    typeof value === "boolean" ? value : undefined
  );
}
export function selectionFeedback() {
  const now = Date.now();
  if (now - lastSelection < 65 || !enabled()) {
    return;
  }
  lastSelection = now;
  void Haptics.selectionAsync().catch(() => {});
}
export function captureFeedback() {
  if (enabled()) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}
