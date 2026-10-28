/**
 * Per-account cap on failed logins, all IPs combined: the per-IP rate limit alone does not stop a
 * distributed guess against the single admin account.
 *
 * Deliberately simple: an in-memory map in the API process, so it is reset on every restart and
 * not shared between instances. That is acceptable here (one process, one admin account); move it
 * to a shared store if the API ever scales out. Unknown emails are counted too, so the answer does
 * not reveal whether an account exists. Side effect: someone who knows the admin email could lock
 * the account out for up to an hour by failing on purpose; a device that already logged in
 * ("trusted device" cookie, see auth/device.ts) bypasses the cap and is not counted.
 */
export const LOGIN_FAILURES_PER_ACCOUNT = 20;
export const LOGIN_FAILURE_WINDOW_MS = 60 * 60 * 1000;
/** Upper bound on tracked emails, so random emails cannot grow the memory without limit. */
const MAX_TRACKED_ACCOUNTS = 10_000;

export type LoginLimiter = {
  /** True when this account has used up its failures for the current window. */
  isBlocked(email: string): boolean;
  recordFailure(email: string): void;
  /** A successful login forgets the earlier failures. */
  reset(email: string): void;
};

export function createLoginLimiter(
  now: () => number = Date.now,
  maxFailures: number = LOGIN_FAILURES_PER_ACCOUNT,
  windowMs: number = LOGIN_FAILURE_WINDOW_MS,
): LoginLimiter {
  // email -> timestamps (ms) of failures still inside the window; Map keeps insertion order.
  const failures = new Map<string, number[]>();

  const recent = (email: string): number[] => {
    const kept = (failures.get(email) ?? []).filter((t) => now() - t < windowMs);
    if (kept.length === 0) failures.delete(email);
    else failures.set(email, kept);
    return kept;
  };

  return {
    isBlocked: (email) => recent(email).length >= maxFailures,
    recordFailure(email) {
      const kept = recent(email);
      kept.push(now());
      failures.delete(email); // re-insert: most recently active last
      failures.set(email, kept);
      // Over the cap: evict the least recently active accounts (first in insertion order).
      for (const key of failures.keys()) {
        if (failures.size <= MAX_TRACKED_ACCOUNTS) break;
        failures.delete(key);
      }
    },
    reset: (email) => void failures.delete(email),
  };
}
