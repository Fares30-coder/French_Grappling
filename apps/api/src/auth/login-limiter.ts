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
export const MAX_TRACKED_ACCOUNTS = 10_000;
/** Shared counter for unknown emails once the map is full (cannot collide with an email: no "@"). */
const OVERFLOW_KEY = 'overflow';

export type LoginLimiter = {
  /**
   * True when this account has used up its failures for the current window. `known` = the email
   * belongs to a real account (the others share one bucket once the map is full).
   */
  isBlocked(email: string, known?: boolean): boolean;
  recordFailure(email: string, known?: boolean): void;
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

  // Real accounts and keys at or near the cap are never evicted: a flood of made-up emails must not
  // reset the counter of the account it wants to guess. Only expired or low-count keys go.
  // Emails seen as real accounts: their counters are never evicted.
  const protectedKeys = new Set<string>();

  const makeRoom = (): boolean => {
    if (failures.size < MAX_TRACKED_ACCOUNTS) return true;
    // Drop expired keys first (recent() deletes them), then the least recently active low-count ones.
    for (const key of [...failures.keys()]) recent(key);
    for (const [key, times] of [...failures]) {
      if (failures.size < MAX_TRACKED_ACCOUNTS) break;
      if (key !== OVERFLOW_KEY && !protectedKeys.has(key) && times.length < maxFailures / 2)
        failures.delete(key);
    }
    return failures.size < MAX_TRACKED_ACCOUNTS;
  };

  const tracked = (email: string) => failures.has(email);

  return {
    isBlocked(email, known = false) {
      const key =
        known || tracked(email)
          ? email
          : failures.size < MAX_TRACKED_ACCOUNTS
            ? email
            : OVERFLOW_KEY;
      return recent(key).length >= maxFailures;
    },
    recordFailure(email, known = false) {
      let key = email;
      if (known) protectedKeys.add(email);
      if (!tracked(email) && !makeRoom()) {
        // Full of keys worth keeping: a real account is still tracked (over the bound by a few
        // entries at most, one per real account); the others share a bucket.
        if (!known) key = OVERFLOW_KEY;
      }
      const kept = recent(key);
      kept.push(now());
      failures.delete(key); // re-insert: most recently active last
      failures.set(key, kept);
    },
    reset: (email) => void failures.delete(email),
  };
}
