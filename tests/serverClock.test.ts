import { describe, expect, it } from "vitest";
import { ServerClock } from "@/lib/exam/serverClock";

describe("ServerClock", () => {
  it("follows server time regardless of how wrong the browser clock is", () => {
    let mono = 5_000; // the monotonic timer has its own arbitrary origin
    const clock = new ServerClock(() => mono);
    clock.sync(1_700_000_000_000, 5_000, 5_000);
    expect(clock.now()).toBe(1_700_000_000_000);
    mono += 12_000;
    expect(clock.now()).toBe(1_700_000_012_000);
    expect(clock.remainingMs(1_700_000_060_000)).toBe(48_000);
  });

  it("assumes the server stamped its time half-way through the round trip", () => {
    const mono = 1_000;
    const clock = new ServerClock(() => mono);
    clock.sync(2_000_000, 900, 1_000); // 100 ms round trip
    expect(clock.now()).toBe(2_000_050);
  });

  it("re-aligns when the server reports a different time", () => {
    let mono = 0;
    const clock = new ServerClock(() => mono);
    clock.sync(1_000_000, 0, 0);
    mono = 30_000;
    clock.sync(1_035_000, 30_000, 30_000); // the server says 5 s more have passed than we measured
    expect(clock.now()).toBe(1_035_000);
  });

  it("keeps a good sample when a later one is too slow to trust, but always takes the first", () => {
    let mono = 0;
    const clock = new ServerClock(() => mono);
    clock.sync(1_000_000, -9_000, 0); // slow, but it is the only sample
    expect(clock.isSynced).toBe(true);
    clock.sync(1_000_000, 0, 0);
    mono = 10_000;
    clock.sync(5_000_000, 0, 10_000); // 10 s round trip: ignored
    expect(clock.now()).toBe(1_010_000);
  });

  it("ignores a non-numeric server time", () => {
    const clock = new ServerClock(() => 0);
    clock.sync(Number.NaN, 0, 0);
    expect(clock.isSynced).toBe(false);
  });
});
