import { describe, expect, it, vi } from 'vitest';
import { crossesIntoAdmin, isAdminPath, isolateAdmin } from './admin-isolation';

const O = 'https://tatamap.test';

describe('admin isolation', () => {
  it('detects admin paths', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/techniques/1')).toBe(true);
    expect(isAdminPath('/administration')).toBe(false);
    expect(isAdminPath('/techniques/admin')).toBe(false);
  });

  it('flags a navigation from a public page into /admin only', () => {
    expect(crossesIntoAdmin('/admin/login', '/carte', O)).toBe(true);
    expect(crossesIntoAdmin({ pathname: '/admin' }, '/', O)).toBe(true);
    expect(crossesIntoAdmin('../admin/x', '/techniques/a', O)).toBe(true);
    expect(crossesIntoAdmin('/admin/techniques', '/admin/login', O)).toBe(false);
    expect(crossesIntoAdmin('/carte', '/', O)).toBe(false);
  });

  it('turns router.navigate into a full load, and reloads on back/forward', () => {
    let listener: (s: { location: { pathname: string } }) => void = () => {};
    const navigate = vi.fn((_to: unknown) => Promise.resolve());
    const router = {
      navigate,
      subscribe: (fn: typeof listener) => {
        listener = fn;
        return () => {};
      },
    };
    const load = vi.fn();
    isolateAdmin(router, load, '/carte', O);
    void router.navigate('/admin/login' as never);
    expect(load).toHaveBeenCalledWith('/admin/login');
    expect(navigate).not.toHaveBeenCalled();
    void router.navigate('/bibliotheque' as never);
    expect(navigate).toHaveBeenCalledTimes(1);
    listener({ location: { pathname: '/admin/techniques' } });
    expect(load).toHaveBeenCalledWith('/admin/techniques');
  });
});
