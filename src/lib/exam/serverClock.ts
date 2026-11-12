/**
 * A clock that follows the SERVER's time, not the browser's.
 *
 * The server reports its time (the database clock — the clock deadlines are enforced on) in API responses. We remember that
 * moment together with a monotonic timer reading and extrapolate from there. A monotonic timer (`performance.now()`) is used on
 * purpose: changing the computer's date/time, or a wrong clock, cannot move the countdown. Half the request round-trip is
 * added to the server timestamp because it was produced mid-flight.
 *
 * The anchor is refreshed on every API response and by a periodic status poll, which also corrects drift (for example a laptop
 * that went to sleep, during which some browsers pause the monotonic timer).
 */
const MAX_TRUSTED_RTT_MS = 3_000;

export class ServerClock {
  private anchorServerMs = 0;
  private anchorMono = 0;
  private synced = false;

  constructor(private readonly mono: () => number) {}

  get isSynced(): boolean {
    return this.synced;
  }

  /**
   * @param serverTimeMs  the server's clock (epoch ms) as reported in the response
   * @param sentMono      monotonic reading just before the request was sent
   * @param receivedMono  monotonic reading when the response arrived
   */
  sync(serverTimeMs: number, sentMono: number, receivedMono: number): void {
    if (!Number.isFinite(serverTimeMs)) return;
    const rtt = Math.max(0, receivedMono - sentMono);
    // A very slow round trip is a poor sample; keep a good earlier one. The first sample is always taken.
    if (this.synced && rtt > MAX_TRUSTED_RTT_MS) return;
    this.anchorServerMs = serverTimeMs + rtt / 2;
    this.anchorMono = receivedMono;
    this.synced = true;
  }

  /** Current server time (epoch ms). */
  now(): number {
    return this.anchorServerMs + (this.mono() - this.anchorMono);
  }

  remainingMs(deadlineMs: number): number {
    return deadlineMs - this.now();
  }
}
