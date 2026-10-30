import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { LogoMark } from '../../ui/Logo';
import { useOnline } from '../offline/use-online';
import { isActive, NAV_ITEMS } from './nav';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright';

function Sidebar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Navigation principale"
      className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col gap-10 border-r border-line bg-ground-deep px-[22px] py-8 md:flex"
    >
      <Link
        to="/"
        className={`flex flex-col gap-2.5 rounded-lg text-ink no-underline ${focusRing}`}
      >
        <span className="flex items-center gap-2.5 text-[19px] font-bold tracking-[-0.01em]">
          <LogoMark />
          Tatamap
        </span>
        <span className="pl-10 text-sm text-ink-muted">La carte du jiu-jitsu, en 3D</span>
      </Link>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-[10px] px-4 text-base no-underline ${focusRing} ${
                  active
                    ? 'bg-accent-wash font-bold text-ink shadow-[inset_3px_0_0_var(--color-accent)]'
                    : 'text-ink-muted hover:bg-surface hover:text-ink'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="m-0 mt-auto text-xs uppercase leading-relaxed tracking-[0.2em] text-ink-faint">
        Explore · Comprends · Progresse
      </p>
    </nav>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-ground-deep px-3 pt-2 pb-[max(env(safe-area-inset-bottom),12px)] md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item, pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-13 flex-1 flex-col items-center justify-center gap-1 rounded-[10px] text-xs no-underline ${focusRing} ${
              active ? 'bg-accent-wash font-bold text-accent-bright' : 'text-ink-muted'
            }`}
          >
            {item.icon}
            {item.shortLabel}
          </Link>
        );
      })}
    </nav>
  );
}

/** Shell of the public pages: dark theme, sidebar on desktop, tab bar on phones. */
export function PublicLayout() {
  const { pathname } = useLocation();
  const online = useOnline();
  return (
    // overflow-x-clip: a public page never scrolls sideways, whatever a child does.
    <div className="flex min-h-dvh overflow-x-clip bg-ground font-sans text-ink antialiased">
      <a
        href="#contenu"
        className="sr-only z-30 rounded-md bg-accent px-4 py-2 font-bold text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Aller au contenu
      </a>
      <Sidebar pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2.5 border-b border-line px-4 py-4 md:hidden">
          <Link
            to="/"
            className={`flex items-center gap-2.5 rounded-lg text-ink no-underline ${focusRing}`}
          >
            <LogoMark size={26} />
            <span className="text-lg font-bold">Tatamap</span>
          </Link>
        </header>
        {!online && (
          <p
            role="status"
            className="m-0 border-b border-line bg-accent-tint px-4 py-2.5 text-center text-sm text-ink"
          >
            Hors ligne : tu consultes les techniques enregistrées sur cet appareil.
          </p>
        )}
        <div id="contenu" className="flex-1 pb-28 md:pb-0">
          <Outlet />
        </div>
      </div>
      <TabBar pathname={pathname} />
      <ScrollRestoration />
    </div>
  );
}
