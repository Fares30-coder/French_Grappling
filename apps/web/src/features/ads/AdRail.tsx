import { useEffect, useState } from 'react';
import { CONTACT_EMAIL } from '../../config';
import { isAdminPath } from '../../lib/admin-isolation';
import { useMediaQuery, WIDE_SCREEN } from '../../lib/use-media-query';
import { useOnline } from '../../lib/use-online';
import {
  ADSENSE_CLIENT,
  ADSENSE_SLOT_INLINE,
  ADSENSE_SLOT_RAIL,
  loadAdSense,
  requestAd,
} from './adsense';
import { activeSponsors, SPONSORS, type Sponsor } from './sponsors';

function SponsorAd({ sponsor }: { sponsor: Sponsor }) {
  return (
    <a
      href={sponsor.href}
      target="_blank"
      rel="sponsored noopener"
      className="mx-auto block max-w-[300px] overflow-hidden rounded-xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright"
    >
      <img
        src={sponsor.image}
        alt={sponsor.alt}
        width={300}
        height={600}
        className="block h-auto w-full"
      />
    </a>
  );
}

type AdFormat = 'vertical' | 'horizontal';

function AdSenseAd({ client, slot, format }: { client: string; slot: string; format: AdFormat }) {
  useEffect(() => {
    loadAdSense(client);
    requestAd();
  }, [client]);
  return (
    <ins
      className={`adsbygoogle block w-full ${format === 'vertical' ? 'min-h-[250px]' : 'min-h-[100px]'}`}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={format === 'vertical' ? 'false' : 'true'}
    />
  );
}

function BecomeSponsor() {
  const subject = encodeURIComponent('Sponsoring Tatamap');
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong bg-surface p-5">
      <p className="m-0 text-base font-bold text-ink">Ta marque ici</p>
      <p className="m-0 text-sm leading-relaxed text-ink-muted">
        Kimonos, clubs, stages, matériel : montre-toi aux pratiquants francophones de jiu-jitsu.
      </p>
      <a
        href={`mailto:${CONTACT_EMAIL}?subject=${subject}`}
        className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-bold text-on-accent no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright"
      >
        Devenir sponsor
      </a>
    </div>
  );
}

/** One slot: a booked sponsor first, else AdSense (online, configured), else "become a sponsor". */
function AdSlot({ slot, format }: { slot: string | undefined; format: AdFormat }) {
  const online = useOnline();
  // Picked once per mount: several sponsors take turns from page to page.
  const [sponsor] = useState(() => {
    const active = activeSponsors(SPONSORS);
    return active[Math.floor(Math.random() * active.length)];
  });
  if (sponsor) return <SponsorAd sponsor={sponsor} />;
  if (online && !isAdminPath(window.location.pathname) && ADSENSE_CLIENT && slot) {
    return <AdSenseAd client={ADSENSE_CLIENT} slot={slot} format={format} />;
  }
  return <BecomeSponsor />;
}

/**
 * Right-hand ad column, wide screens only (no room beside the content on phones and tablets).
 * Kept away from the navigation (AdSense forbids ads that invite accidental clicks).
 */
export function AdRail({ pathname }: { pathname: string }) {
  // Not mounted at all on narrow screens: a hidden slot would still load AdSense and ask for an ad.
  const wide = useMediaQuery(WIDE_SCREEN);
  if (!wide) return null;
  return (
    <aside
      aria-label="Sponsorisé"
      className="hidden w-[300px] shrink-0 border-l border-line bg-ground-deep px-4 py-8 xl:block"
    >
      <div className="sticky top-8 flex flex-col gap-2">
        <p className="m-0 text-xs uppercase tracking-[0.2em] text-ink-faint">Sponsorisé</p>
        {/* New page, new ad: the key remounts the slot on each route. */}
        <AdSlot key={pathname} slot={ADSENSE_SLOT_RAIL} format="vertical" />
      </div>
    </aside>
  );
}

/**
 * The only ad of phones and tablets (where the rail is hidden), in the flow of the technique page,
 * after the text and away from the viewer controls. Never sticky, never over the content.
 */
export function InlineAd() {
  const wide = useMediaQuery(WIDE_SCREEN);
  if (wide) return null;
  return (
    <aside aria-label="Sponsorisé" className="flex flex-col gap-2">
      <p className="m-0 text-xs uppercase tracking-[0.2em] text-ink-faint">Sponsorisé</p>
      <AdSlot slot={ADSENSE_SLOT_INLINE} format="horizontal" />
    </aside>
  );
}
