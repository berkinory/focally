import { expect, test } from "bun:test";

import type { CameraPhoto } from "@/camera";

import {
  applyPhotoChange,
  publishPhotoChange,
  subscribePhotoChanges,
} from "./photo-changes";

const photos: CameraPhoto[] = ["first", "second", "third"].map((uri) => ({
  uri,
  width: 1200,
  height: 800,
  focalLength: 35,
  capturedAt: "2026-09-16T10:00:00Z",
  favorite: true,
}));

test("gallery edits preserve loaded order and leave unrelated photos intact", () => {
  const result = applyPhotoChange(
    photos,
    { kind: "favorite", uri: "second", favorite: false },
    false
  );
  expect(result.map((photo) => photo.uri)).toEqual([
    "first",
    "second",
    "third",
  ]);
  expect(result[1]?.favorite).toBe(false);
  expect(result[0]).toEqual(photos[0]);
  expect(photos[1]?.favorite).toBe(true);
});

test("deleting and unfavoriting remove only the selected entry from a filtered gallery", () => {
  expect(
    applyPhotoChange(
      photos,
      { kind: "favorite", uri: "second", favorite: false },
      true
    ).map((photo) => photo.uri)
  ).toEqual(["first", "third"]);
  expect(
    applyPhotoChange(photos, { kind: "deleted", uri: "third" }, false).map(
      (photo) => photo.uri
    )
  ).toEqual(["first", "second"]);
});

test("unsubscribing stops delivery without removing other listeners", () => {
  let removed = 0;
  let active = 0;
  const unsubscribe = subscribePhotoChanges(() => {
    removed += 1;
  });
  const unsubscribeActive = subscribePhotoChanges(() => {
    active += 1;
  });
  try {
    publishPhotoChange({ kind: "deleted", uri: "first" });
    unsubscribe();
    publishPhotoChange({ kind: "deleted", uri: "second" });
    expect(removed).toBe(1);
    expect(active).toBe(2);
  } finally {
    unsubscribe();
    unsubscribeActive();
  }
});
