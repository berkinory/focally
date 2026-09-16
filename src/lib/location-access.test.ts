import { expect, test } from "bun:test";

import { preferenceDefaults } from "./camera-settings";
import { createLocationAccess } from "./location-access";

function setup(enabled: boolean = preferenceDefaults.photoLocation) {
  const state = {
    granted: false,
    enabled,
    shownAsGranted: false,
    requested: 0,
    settingsOpened: 0,
  };
  const access = {
    check: () => Promise.resolve(state.granted),
    request: (): Promise<"granted" | "denied" | "blocked"> => {
      state.requested += 1;
      return Promise.resolve("denied");
    },
    openSettings: () => {
      state.settingsOpened += 1;
      return Promise.resolve();
    },
    setEnabled: (enabled: boolean) => {
      state.enabled = enabled;
    },
    onPermission: (granted: boolean) => {
      state.shownAsGranted = granted;
    },
  };
  return { state, access };
}

test("permission alone never opts in; revocation disables a saved location preference", async () => {
  const { state, access } = setup();
  const location = createLocationAccess(access);
  state.granted = true;
  await location.refresh();
  expect(state.enabled).toBe(false);
  expect(state.requested).toBe(0);
  await location.enable();
  expect(state.enabled).toBe(true);
  state.granted = false;
  await location.refresh();
  expect(state.enabled).toBe(false);
  expect(state.shownAsGranted).toBe(false);
  expect(state.requested).toBe(0);
});

test("denial stays off; a blocked request opens settings and enables only after a grant", async () => {
  const { state, access } = setup();
  const location = createLocationAccess(access);
  await location.enable();
  expect(state.enabled).toBe(false);
  expect(state.settingsOpened).toBe(0);
  access.request = () => Promise.resolve("blocked");
  await location.enable();
  expect(state.enabled).toBe(false);
  expect(state.settingsOpened).toBe(1);
  await location.refresh();
  expect(state.enabled).toBe(false);
  state.granted = true;
  await location.refresh();
  expect(state.enabled).toBe(false);
  state.granted = false;
  await location.enable();
  state.granted = true;
  await location.refresh();
  expect(state.enabled).toBe(true);
});

test("disabling or leaving ignores a late grant and cannot open settings afterward", async () => {
  for (const action of ["disable", "cancel"] as const) {
    for (const result of ["granted", "blocked"] as const) {
      const { state, access } = setup();
      const response = Promise.withResolvers<typeof result>();
      const started = Promise.withResolvers<null>();
      access.request = () => {
        started.resolve(null);
        return response.promise;
      };
      const location = createLocationAccess(access);
      const pending = location.enable();
      await started.promise;
      location[action]();
      response.resolve(result);
      await pending;
      expect(state.enabled).toBe(false);
      expect(state.settingsOpened).toBe(0);
    }
  }
});

test("returning during a pending settings launch rechecks permission once it settles", async () => {
  const { state, access } = setup();
  const launch = Promise.withResolvers<null>();
  const started = Promise.withResolvers<null>();
  access.request = () => Promise.resolve("blocked");
  access.openSettings = async () => {
    started.resolve(null);
    await launch.promise;
  };
  const location = createLocationAccess(access);
  const pending = location.enable();
  await started.promise;
  state.granted = true;
  await location.refresh();
  expect(state.enabled).toBe(false);
  launch.resolve(null);
  await pending;
  expect(state.enabled).toBe(true);
});

test("permission check and settings launch failures keep geotagging disabled", async () => {
  const { state, access } = setup();
  state.enabled = true;
  access.check = () => Promise.reject(new Error("Permission check failed"));
  const location = createLocationAccess(access);
  expect(await location.refresh().catch((error: unknown) => error)).toEqual(
    new Error("Permission check failed")
  );
  expect(state.enabled).toBe(false);
  access.check = () => Promise.resolve(false);
  access.request = () => Promise.resolve("blocked");
  access.openSettings = () => Promise.reject(new Error("Settings unavailable"));
  expect(await location.enable().catch((error: unknown) => error)).toEqual(
    new Error("Settings unavailable")
  );
  expect(state.enabled).toBe(false);
  state.granted = true;
  access.check = () => Promise.resolve(true);
  await location.refresh();
  expect(state.enabled).toBe(false);
});

test("the permission dialog resume cannot consume the later settings return", async () => {
  const { state, access } = setup();
  const response = Promise.withResolvers<"blocked">();
  const started = Promise.withResolvers<null>();
  access.request = () => {
    started.resolve(null);
    return response.promise;
  };
  const location = createLocationAccess(access);
  const pending = location.enable();
  await started.promise;
  await location.refresh();
  response.resolve("blocked");
  await pending;
  expect(state.enabled).toBe(false);
  state.granted = true;
  await location.refresh();
  expect(state.enabled).toBe(true);
});
