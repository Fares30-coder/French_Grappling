import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// OWASP baseline for argon2id. Do NOT pass `algorithm`: its type is an ambient `const enum`,
// unusable with isolatedModules; argon2id is the library default.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string): Promise<string> => hash(password, OPTIONS);

// Computed once, lazily: verified against when the admin is unknown so that the response time
// does not tell whether an email exists.
let dummyHash: Promise<string> | undefined;
const getDummyHash = (): Promise<string> => {
  dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
  return dummyHash;
};

/** Constant-time-ish: when the admin is unknown (`storedHash` null), verify against a dummy hash anyway. */
export async function verifyPassword(
  storedHash: string | null,
  password: string,
): Promise<boolean> {
  if (storedHash === null) {
    await verify(await getDummyHash(), password).catch(() => false);
    return false;
  }
  try {
    return await verify(storedHash, password);
  } catch {
    // Malformed stored hash: treat as a mismatch, never as an error that reveals something.
    return false;
  }
}

/** Warms the dummy hash at startup so the first unknown-email login is not faster than the rest. */
export const warmUpPasswordHashing = (): Promise<string> => getDummyHash();
