export const DEFAULT_ADMIN_PATH = '/admin/techniques';

/**
 * Where to go after login. Only internal paths under /admin are accepted: anything else (absolute
 * URL, protocol-relative `//host`, backslash tricks, other app paths) falls back to the default,
 * so `?next=` cannot be used as an open redirect.
 */
export function safeNext(next: string | null | undefined, fallback = DEFAULT_ADMIN_PATH): string {
  if (!next) return fallback;
  // Backslashes, whitespace and control characters are treated as separators by some browsers.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (/[\\\s\u0000-\u001f\u007f]/.test(next)) return fallback;
  if (next !== '/admin' && !/^\/admin[/?#]/.test(next)) return fallback;
  try {
    const url = new URL(next, 'http://internal.invalid');
    if (url.origin !== 'http://internal.invalid') return fallback;
    if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return fallback;
  } catch {
    return fallback;
  }
  return next;
}
