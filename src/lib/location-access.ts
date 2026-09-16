type PermissionResult = "granted" | "denied" | "blocked";

export function createLocationAccess(options: {
  check: () => Promise<boolean>;
  request: () => Promise<PermissionResult>;
  openSettings: () => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  onPermission: (granted: boolean) => void;
}) {
  let revision = 0;
  let requesting = false;
  let awaitingSettings = false;
  let refreshQueued = false;

  const update = (granted: boolean, enable: boolean) => {
    options.onPermission(granted);
    if (!granted || enable) {
      options.setEnabled(granted);
    }
  };
  const cancel = () => {
    revision += 1;
    requesting = false;
    awaitingSettings = false;
    refreshQueued = false;
  };
  const refresh = async () => {
    if (requesting) {
      refreshQueued = true;
      return;
    }
    const current = ++revision;
    try {
      const granted = await options.check();
      if (current !== revision) {
        return;
      }
      update(granted, awaitingSettings);
      awaitingSettings = false;
    } catch (error) {
      if (current !== revision) {
        return;
      }
      awaitingSettings = false;
      update(false, false);
      throw error;
    }
  };

  return {
    cancel,
    refresh,
    disable() {
      cancel();
      options.setEnabled(false);
    },
    async enable() {
      if (requesting) {
        return;
      }
      const current = ++revision;
      requesting = true;
      awaitingSettings = false;
      try {
        const granted = await options.check();
        if (current !== revision) {
          return;
        }
        const result = granted ? "granted" : await options.request();
        if (current !== revision) {
          return;
        }
        update(result === "granted", true);
        if (result === "blocked") {
          refreshQueued = false;
          awaitingSettings = true;
          await options.openSettings();
        }
      } catch (error) {
        if (current !== revision) {
          return;
        }
        awaitingSettings = false;
        update(false, false);
        throw error;
      } finally {
        if (current === revision) {
          requesting = false;
          if (refreshQueued) {
            refreshQueued = false;
            await refresh();
          }
        }
      }
    },
  };
}
