// Image decoding and the flight have separate lifetimes. A decode timeout must
// never land a photo whose animation is still running, or start a late flight.
export function createCaptureFlightLifecycle(
  start: () => void,
  complete: () => void
) {
  let phase: "waiting" | "flying" | "finished" = "waiting";
  const finish = () => {
    if (phase === "finished") {
      return;
    }
    phase = "finished";
    complete();
  };
  return {
    display() {
      if (phase !== "waiting") {
        return;
      }
      phase = "flying";
      start();
    },
    arrive() {
      if (phase === "flying") {
        finish();
      }
    },
    expire() {
      if (phase === "waiting") {
        finish();
      }
    },
    fail: finish,
    cancel() {
      phase = "finished";
    },
  };
}
