import {
  CATEGORY_LABELS_FR,
  DEFAULT_TRANSITION_MS,
  LEVEL_LABELS_FR,
  type TechniqueListItem,
} from '@tatamap/shared';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '../../ui/Badge';
import { useTechnique } from '../techniques/use-technique';
import { requestSnapshot, useSnapshot } from '../viewer/thumbnail-store';

const LiveThumbnail = lazy(() =>
  import('../viewer/thumbnails').then((m) => ({ default: m.LiveThumbnail })),
);

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && window.matchMedia(query).matches;

/**
 * Whether the card's thumbnail animates: on hover or keyboard focus with a mouse; on phones
 * (no hover), while the card crosses the middle of the screen. Never with reduced motion.
 */
function useCardPlaying(ref: React.RefObject<HTMLElement | null>) {
  const [hovered, setHovered] = useState(false);
  const [centered, setCentered] = useState(false);
  const [canHover] = useState(() => matches('(hover: hover)'));
  const [reducedMotion] = useState(() => matches('(prefers-reduced-motion: reduce)'));

  useEffect(() => {
    const el = ref.current;
    if (canHover || reducedMotion || !el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setCentered(entry?.isIntersecting ?? false),
      { rootMargin: '-42% 0px -42% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, canHover, reducedMotion]);

  const playing = !reducedMotion && (canHover ? hovered : centered);
  const handlers = {
    onPointerEnter: (e: React.PointerEvent) => e.pointerType === 'mouse' && setHovered(true),
    onPointerLeave: () => setHovered(false),
    onFocus: () => setHovered(true),
    onBlur: () => setHovered(false),
  };
  return { playing, handlers };
}

/** "Garde fermée → Montée · Débutant" (a submission has no end position). */
export function techniqueMeta(t: TechniqueListItem): string {
  const route = t.endPosition
    ? `${t.startPosition.name} → ${t.endPosition.name}`
    : t.startPosition.name;
  return `${route} · ${LEVEL_LABELS_FR[t.level]}`;
}

/** Same color as the stills (PUBLIC_SCENE.thumbnail), shown until the image is ready. */
const thumbBackground = 'relative overflow-hidden bg-[#14272a]';

/** A library card. The 3D thumbnail loads after the text. */
export function TechniqueCard({ technique }: { technique: TechniqueListItem }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const { playing, handlers } = useCardPlaying(ref);
  // The full steps are fetched only once the card plays (and then cached for the page).
  const detail = useTechnique(technique.slug, { enabled: playing });
  const steps = useMemo(
    () =>
      detail.data
        ? detail.data.steps.map((s) => ({ pose: s.pose, transitionMs: s.transitionMs }))
        : [{ pose: technique.preview, transitionMs: DEFAULT_TRANSITION_MS }],
    [detail.data, technique.preview],
  );

  // The still image scrolls with the page like any image; only a playing card runs WebGL.
  useEffect(() => requestSnapshot(technique.slug, technique.preview), [technique]);
  const snapshot = useSnapshot(technique.slug);

  const tone = technique.category === 'submission' ? 'submission' : 'sweep';
  const category = CATEGORY_LABELS_FR[technique.category];

  return (
    <Link
      ref={ref}
      to={`/techniques/${technique.slug}`}
      {...handlers}
      className="group flex w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink no-underline transition-colors hover:border-line-stronger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright"
    >
      <div className={`${thumbBackground} aspect-[16/10]`}>
        {snapshot && (
          <img src={snapshot} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        {playing && (
          <div className="absolute inset-0">
            <Suspense fallback={null}>
              <LiveThumbnail steps={steps} />
            </Suspense>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 px-[18px] pt-4 pb-5">
        <span className="self-start">
          <Badge tone={tone}>{category}</Badge>
        </span>
        <span className="text-[17px] font-bold leading-tight">{technique.name}</span>
        <span className="text-[13px] text-ink-muted">
          {techniqueMeta(technique)} · {technique.stepCount} étapes
        </span>
      </div>
    </Link>
  );
}
