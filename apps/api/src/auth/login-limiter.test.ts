import { describe, expect, it } from 'vitest';
import { loginRateLimitKey } from '../routes/auth';
import { createLoginLimiter, MAX_TRACKED_ACCOUNTS } from './login-limiter';

describe('login limiter under a flood of made-up emails', () => {
  it('keeps the failures of the real account', () => {
    const limiter = createLoginLimiter(() => 0);
    for (let i = 0; i < 19; i++) limiter.recordFailure('admin@example.test', true);
    for (let i = 0; i < MAX_TRACKED_ACCOUNTS; i++) limiter.recordFailure(`f${i}@example.test`);
    limiter.recordFailure('admin@example.test', true);
    expect(limiter.isBlocked('admin@example.test', true)).toBe(true);
  });

  it('never evicts a real account, even with few failures', () => {
    const limiter = createLoginLimiter(() => 0);
    for (let i = 0; i < 5; i++) limiter.recordFailure('admin@example.test', true);
    for (let i = 0; i < MAX_TRACKED_ACCOUNTS + 50; i++) limiter.recordFailure(`f${i}@example.test`);
    for (let i = 0; i < 14; i++) limiter.recordFailure('admin@example.test', true);
    expect(limiter.isBlocked('admin@example.test', true)).toBe(false);
    limiter.recordFailure('admin@example.test', true);
    expect(limiter.isBlocked('admin@example.test', true)).toBe(true);
  });

  it('counts unknown emails in one shared bucket once full', () => {
    const limiter = createLoginLimiter(() => 0, 2);
    for (let i = 0; i < MAX_TRACKED_ACCOUNTS; i++) limiter.recordFailure(`f${i}@example.test`);
    expect(limiter.isBlocked('new@example.test')).toBe(false);
    for (let i = 0; i < 2; i++) limiter.recordFailure(`g${i}@example.test`);
    expect(limiter.isBlocked('another@example.test')).toBe(true);
    // A real account is still tracked on its own and is not blocked by the bucket.
    expect(limiter.isBlocked('admin@example.test', true)).toBe(false);
  });
});

describe('loginRateLimitKey', () => {
  it('groups IPv6 addresses by /64 and leaves IPv4 alone', () => {
    expect(loginRateLimitKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(
      loginRateLimitKey('2001:DB8:1:2::1'),
    );
    expect(loginRateLimitKey('2001:db8:1:2::1')).not.toBe(loginRateLimitKey('2001:db8:1:3::1'));
    expect(loginRateLimitKey('203.0.113.7')).toBe('203.0.113.7');
    expect(loginRateLimitKey('::ffff:203.0.113.7')).toBe('::ffff:203.0.113.7');
  });
});
