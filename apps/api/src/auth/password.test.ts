import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, warmUpPasswordHashing } from './password';

describe('password hashing', () => {
  it('produces an argon2id hash with the expected parameters', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    await expect(verifyPassword(hash, 'correct horse battery')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong horse battery')).resolves.toBe(false);
  });

  it('rejects a malformed stored hash without throwing', async () => {
    await expect(verifyPassword('not-a-hash', 'x')).resolves.toBe(false);
  });

  it('verifyPassword(null, x) is false and takes a time of the same order as a real verify', async () => {
    const hash = await hashPassword('correct horse battery');
    await warmUpPasswordHashing();
    const time = async (fn: () => Promise<unknown>) => {
      const start = performance.now();
      await fn();
      return performance.now() - start;
    };
    // Median of a few runs to smooth out noise.
    const median = async (fn: () => Promise<unknown>) => {
      const runs: number[] = [];
      for (let i = 0; i < 5; i++) runs.push(await time(fn));
      return runs.sort((a, b) => a - b)[2] ?? 0;
    };
    await expect(verifyPassword(null, 'whatever')).resolves.toBe(false);
    const real = await median(() => verifyPassword(hash, 'wrong'));
    const dummy = await median(() => verifyPassword(null, 'wrong'));
    expect(dummy).toBeGreaterThan(real * 0.5);
  });
});
