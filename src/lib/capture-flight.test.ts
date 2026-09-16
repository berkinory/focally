import { expect, test } from "bun:test";

import { createCaptureFlightLifecycle } from "./capture-flight";

test("a slow image decode cannot promote the thumbnail before the flight lands", () => {
  const events: string[] = [];
  const flight = createCaptureFlightLifecycle(
    () => {
      events.push("animate");
    },
    () => {
      events.push("promote thumbnail");
    }
  );
  // The image arrives just before the decode deadline; its flight ends later.
  flight.display();
  flight.expire();
  flight.display();
  expect(events).toEqual(["animate"]);
  flight.arrive();
  flight.arrive();
  expect(events).toEqual(["animate", "promote thumbnail"]);
});

test("a decode failure or timeout completes once and cannot animate a late image", () => {
  for (const failure of ["expire", "fail"] as const) {
    const events: string[] = [];
    const flight = createCaptureFlightLifecycle(
      () => {
        events.push("animate");
      },
      () => {
        events.push("promote thumbnail");
      }
    );
    flight[failure]();
    flight.display();
    flight.arrive();
    flight.fail();
    expect(events).toEqual(["promote thumbnail"]);
  }
});

test("leaving the camera cancels late decode and animation callbacks", () => {
  for (const alreadyFlying of [false, true]) {
    const events: string[] = [];
    const flight = createCaptureFlightLifecycle(
      () => {
        events.push("animate");
      },
      () => {
        events.push("promote thumbnail");
      }
    );
    if (alreadyFlying) {
      flight.display();
    }
    flight.cancel();
    flight.expire();
    flight.display();
    flight.arrive();
    flight.fail();
    expect(events).toEqual(alreadyFlying ? ["animate"] : []);
  }
});
