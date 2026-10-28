import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { loadEnv, toAppConfig } from './env';

const SECRET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL'; // 48 bytes, 48 distinct chars
const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: SECRET,
  WEB_ORIGINS: 'http://localhost:5173',
};

describe('loadEnv', () => {
  it('accepts the .env.example configuration once JWT_SECRET is filled in', () => {
    const example = parse(readFileSync(new URL('../.env.example', import.meta.url)));
    expect(example.JWT_SECRET).toBe(''); // never a committed secret
    expect(() => loadEnv({ ...example, JWT_SECRET: SECRET })).not.toThrow();
  });

  it('applies the defaults', () => {
    const env = loadEnv(valid);
    expect(env).toMatchObject({ COOKIE_SECURE: true, TRUST_PROXY: 0, NODE_ENV: 'development' });
    expect(env.WEB_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('refuses a missing JWT_SECRET', () => {
    const { JWT_SECRET: _omitted, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrow(/JWT_SECRET/);
  });

  it('refuses a 31-byte JWT_SECRET and accepts 32 bytes', () => {
    expect(() => loadEnv({ ...valid, JWT_SECRET: SECRET.slice(0, 31) })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ ...valid, JWT_SECRET: SECRET.slice(0, 32) })).not.toThrow();
  });

  it('refuses a JWT_SECRET with too few distinct characters', () => {
    for (const weak of ['x'.repeat(48), 'abc'.repeat(20), 'abcdefghi'.repeat(6)]) {
      expect(() => loadEnv({ ...valid, JWT_SECRET: weak })).toThrow(/openssl rand -base64 48/);
    }
    expect(() => loadEnv({ ...valid, JWT_SECRET: 'abcdefghij'.repeat(5) })).not.toThrow();
  });

  it('refuses an empty or malformed WEB_ORIGINS', () => {
    expect(() => loadEnv({ ...valid, WEB_ORIGINS: '' })).toThrow(/WEB_ORIGINS/);
    expect(() => loadEnv({ ...valid, WEB_ORIGINS: ' , ' })).toThrow(/WEB_ORIGINS/);
    expect(() => loadEnv({ ...valid, WEB_ORIGINS: 'not a url' })).toThrow(/WEB_ORIGINS/);
  });

  it('accepts only http: and https: origins', () => {
    for (const bad of ['mailto:a@b.test', 'ftp://example.test', 'javascript:alert(1)']) {
      expect(() => loadEnv({ ...valid, WEB_ORIGINS: bad })).toThrow(/WEB_ORIGINS/);
    }
    expect(() => loadEnv({ ...valid, WEB_ORIGINS: 'https://tatamap.fr, mailto:a@b.test' })).toThrow(
      /WEB_ORIGINS/,
    );
  });

  it('requires https: origins in production only', () => {
    const production = { ...valid, NODE_ENV: 'production' };
    expect(() => loadEnv({ ...production, WEB_ORIGINS: 'http://tatamap.fr' })).toThrow(
      /WEB_ORIGINS/,
    );
    expect(() =>
      loadEnv({ ...production, WEB_ORIGINS: 'https://tatamap.fr,http://localhost:5173' }),
    ).toThrow(/WEB_ORIGINS/);
    expect(() => loadEnv({ ...production, WEB_ORIGINS: 'https://tatamap.fr' })).not.toThrow();
    expect(() => loadEnv({ ...valid, WEB_ORIGINS: 'http://localhost:5173' })).not.toThrow();
  });

  it('normalises several origins to scheme://host[:port]', () => {
    const env = loadEnv({ ...valid, WEB_ORIGINS: 'http://localhost:5173/, https://tatamap.fr/x' });
    expect(env.WEB_ORIGINS).toEqual(['http://localhost:5173', 'https://tatamap.fr']);
  });

  it('refuses COOKIE_SECURE=false in production only', () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(
      /COOKIE_SECURE/,
    );
    expect(() =>
      loadEnv({ ...valid, NODE_ENV: 'development', COOKIE_SECURE: 'false' }),
    ).not.toThrow();
  });
});

describe('toAppConfig', () => {
  it('uses the __Host- cookie name when Secure, a plain one otherwise', () => {
    expect(toAppConfig(loadEnv(valid)).cookieName).toBe('__Host-tatamap_session');
    expect(toAppConfig(loadEnv({ ...valid, COOKIE_SECURE: 'false' })).cookieName).toBe(
      'tatamap_session',
    );
  });
});
