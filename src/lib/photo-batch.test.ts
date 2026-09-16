import { expect, test } from "bun:test";

import { runPhotoBatch } from "./photo-batch";

test("batch exports are serialized and each URI is written once", async () => {
  const first = Promise.withResolvers<null>();
  const calls: string[] = [];
  const settled: string[] = [];
  const result = runPhotoBatch(
    ["one", "one", "two"],
    async (uri) => {
      calls.push(uri);
      if (uri === "one") {
        await first.promise;
      }
    },
    {
      shouldContinue: () => true,
      onSettled: (uri) => {
        settled.push(uri);
      },
    }
  );
  expect(calls).toEqual(["one"]);
  expect(settled).toEqual([]);
  first.resolve(null);
  expect(await result).toEqual({
    completed: ["one", "two"],
    failed: [],
    remaining: [],
  });
  expect(calls).toEqual(["one", "two"]);
});

test("partial failure keeps failed items available for retry without repeating successes", async () => {
  const written: string[] = [];
  const progress: number[] = [];
  const options = {
    shouldContinue: () => true,
    onSettled: (_uri: string, _success: boolean, finished: number) => {
      progress.push(finished);
    },
  };
  const result = await runPhotoBatch(
    ["one", "missing", "three"],
    (uri) => {
      if (uri === "missing") {
        return Promise.reject(new Error("Missing file"));
      }
      written.push(uri);
      return Promise.resolve();
    },
    options
  );
  expect(result).toEqual({
    completed: ["one", "three"],
    failed: ["missing"],
    remaining: [],
  });
  expect(progress).toEqual([1, 2, 3]);
  await runPhotoBatch(
    result.failed,
    (uri) => {
      written.push(uri);
      return Promise.resolve();
    },
    options
  );
  expect(written).toEqual(["one", "three", "missing"]);
});

test("stopping a batch lets the current native write settle and leaves the rest untouched", async () => {
  const pending = Promise.withResolvers<null>();
  let active = true;
  const calls: string[] = [];
  const committed: string[] = [];
  const result = runPhotoBatch(
    ["one", "two", "three"],
    async (uri) => {
      calls.push(uri);
      await pending.promise;
    },
    {
      shouldContinue: () => active,
      onSettled: (uri, success) => {
        if (success) {
          committed.push(uri);
        }
      },
    }
  );
  active = false;
  pending.resolve(null);
  expect(await result).toEqual({
    completed: ["one"],
    failed: [],
    remaining: ["two", "three"],
  });
  expect(calls).toEqual(["one"]);
  expect(committed).toEqual(["one"]);
});
