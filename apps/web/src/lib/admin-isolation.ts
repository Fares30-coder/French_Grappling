/**
 * The admin must never run in a document that may have loaded the AdSense script: a third-party
 * script shares the origin, hence the session cookie. So entering /admin from a public page is a
 * full page load (the server then sends the strict CSP without Google origins), and the AdSense
 * script is never added when the path is under /admin.
 */
export const isAdminPath = (pathname: string): boolean =>
  pathname === '/admin' || pathname.startsWith('/admin/');

/** Pathname of a router target (string or object form), resolved against the current page. */
function targetPathname(to: unknown, base: string): string | null {
  if (typeof to === 'string') return new URL(to, base).pathname;
  if (to && typeof to === 'object' && 'pathname' in to && typeof to.pathname === 'string') {
    return new URL(to.pathname, base).pathname;
  }
  return null;
}

/** True when navigating from `currentPath` to `to` crosses into /admin and must reload. */
export function crossesIntoAdmin(to: unknown, currentPath: string, origin: string): boolean {
  const target = targetPathname(to, `${origin}${currentPath}`);
  return target !== null && isAdminPath(target) && !isAdminPath(currentPath);
}

type NavigableRouter = {
  navigate: (to: never, ...rest: never[]) => Promise<void>;
  subscribe: (fn: (state: { location: { pathname: string } }) => void) => () => void;
};

/**
 * Makes every router navigation into /admin a full page load: links, `navigate`, `<Navigate>`
 * (they all end in `router.navigate`), and back/forward (caught by the subscription).
 * `load` is `window.location.assign` in the browser.
 */
export function isolateAdmin(
  router: NavigableRouter,
  load: (url: string) => void,
  loadedPath: string,
  origin: string,
): void {
  const original = router.navigate.bind(router);
  let current = loadedPath;
  router.navigate = ((to: unknown, ...rest: unknown[]) => {
    if (crossesIntoAdmin(to, current, origin)) {
      load(typeof to === 'string' ? to : String((to as { pathname: string }).pathname));
      return Promise.resolve();
    }
    return (original as (...a: unknown[]) => Promise<void>)(to, ...rest);
  }) as NavigableRouter['navigate'];
  router.subscribe((state) => {
    const path = state.location.pathname;
    // Back/forward from a public page into /admin: the router already switched, reload.
    if (isAdminPath(path) && !isAdminPath(loadedPath)) load(path);
    current = path;
  });
}
