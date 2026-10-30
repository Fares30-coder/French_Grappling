import { useQuery } from '@tanstack/react-query';
import {
  CATEGORY_LABELS_FR,
  graphSchema,
  LEVEL_LABELS_FR,
  POSITION_ROLE_LABELS_FR,
  type TechniqueSummary,
} from '@tatamap/shared';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { fetchJson } from '../../lib/api';
import { buttonClass } from '../../ui/button';
import { PageHeader } from '../../ui/text';
import { type GraphLayout, type LaidNode, layoutGraph, type Orientation } from './graph-layout';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright';

function useGraph() {
  return useQuery({
    queryKey: ['graph'],
    queryFn: ({ signal }) => fetchJson('/api/graph', graphSchema, { signal }),
  });
}

function useOrientation(): Orientation {
  const query = '(min-width: 768px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setWide(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return wide ? 'horizontal' : 'vertical';
}

const pct = (value: number, total: number) => `${(value / total) * 100}%`;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

function GraphView({
  layout,
  selected,
  onSelect,
}: {
  layout: GraphLayout;
  selected: string | undefined;
  onSelect: (slug: string) => void;
}) {
  const { width, height, nodeSize } = layout;
  const touches = (e: { from: string; to: string }) => e.from === selected || e.to === selected;
  const edgeTone = (e: { from: string; to: string }) =>
    !selected ? 'idle' : touches(e) ? 'active' : 'dim';

  return (
    <div
      className="relative w-full rounded-xl bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] [background-size:24px_24px]"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" fill="#4e7c70" />
          </marker>
          <marker
            id="arrow-active"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" fill="var(--color-accent-bright)" />
          </marker>
        </defs>
        {layout.edges.map((e) => {
          const tone = edgeTone(e);
          return (
            <path
              key={`${e.from}>${e.to}`}
              d={e.path}
              fill="none"
              stroke={tone === 'active' ? 'var(--color-accent-bright)' : '#4e7c70'}
              strokeWidth={tone === 'active' ? 4 : 2.5}
              strokeOpacity={tone === 'dim' ? 0.35 : 1}
              vectorEffect="non-scaling-stroke"
              markerEnd={tone === 'active' ? 'url(#arrow-active)' : 'url(#arrow)'}
            />
          );
        })}
      </svg>

      {layout.edges.map((e) =>
        e.label ? (
          <span
            key={`label-${e.from}>${e.to}`}
            aria-hidden="true"
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2.5 py-1 text-[13px] whitespace-nowrap ${
              edgeTone(e) === 'active'
                ? 'border-accent bg-accent-tint text-ink'
                : 'border-line-strong bg-surface text-ink-soft'
            } ${edgeTone(e) === 'dim' ? 'opacity-40' : ''}`}
            style={{ left: pct(e.label.x, width), top: pct(e.label.y, height) }}
          >
            {e.label.text}
          </span>
        ) : null,
      )}

      {layout.nodes.map((n) => (
        <NodeButton
          key={n.slug}
          node={n}
          selected={n.slug === selected}
          dim={selected !== undefined && n.slug !== selected}
          style={{
            left: pct(n.x, width),
            top: pct(n.y, height),
            width: pct(nodeSize, width),
          }}
          onSelect={() => onSelect(n.slug)}
        />
      ))}
    </div>
  );
}

function NodeButton({
  node,
  selected,
  dim,
  style,
  onSelect,
}: {
  node: LaidNode;
  selected: boolean;
  dim: boolean;
  style: CSSProperties;
  onSelect: () => void;
}) {
  const filled = node.role === 'top';
  const subs = node.submissions.length;
  const role = POSITION_ROLE_LABELS_FR[node.role].toLowerCase();
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${node.name}, ${role}, ${plural(node.techniqueCount, 'technique')}`}
      onClick={onSelect}
      style={style}
      className={`absolute flex aspect-square min-w-0 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border-[3px] border-accent p-1.5 text-center leading-tight transition-[box-shadow,opacity] ${focusRing} ${
        filled ? 'bg-accent text-on-accent' : 'bg-surface-sunken text-ink'
      } ${node.role === 'neutral' ? 'border-dashed' : ''} ${
        selected ? 'shadow-[0_0_0_8px_rgb(29_158_117/0.25),0_0_36px_rgb(29_158_117/0.45)]' : ''
      } ${dim ? 'opacity-70 hover:opacity-100' : ''}`}
    >
      <span className="text-[12px] font-bold md:text-[15px]">{node.name}</span>
      {subs > 0 && (
        <span
          className={`font-mono text-[10px] md:text-[11px] ${filled ? 'text-on-accent' : 'text-opponent-soft'}`}
        >
          {subs} soum.
        </span>
      )}
    </button>
  );
}

function TechniqueLinks({ techniques, arrow }: { techniques: TechniqueLinkItem[]; arrow: string }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {techniques.map(({ technique, other }) => (
        <li key={technique.slug}>
          <Link
            to={`/techniques/${technique.slug}`}
            className={`flex min-h-11 flex-col gap-1 rounded-xl border border-line bg-surface-sunken px-3.5 py-3 text-ink no-underline hover:border-line-strong ${focusRing}`}
          >
            <span className="text-[15px] font-bold">{technique.name}</span>
            <span
              className={`text-[13px] ${technique.category === 'submission' ? 'text-opponent-soft' : 'text-accent-soft'}`}
            >
              {CATEGORY_LABELS_FR[technique.category]}
              {other ? ` ${arrow} ${other}` : ''} · {LEVEL_LABELS_FR[technique.level]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type TechniqueLinkItem = { technique: TechniqueSummary; other: string | null };

export function MapPage() {
  const graph = useGraph();
  const orientation = useOrientation();
  const [params, setParams] = useSearchParams();
  const panelRef = useRef<HTMLElement>(null);
  const layout = useMemo(
    () => (graph.data ? layoutGraph(graph.data, orientation) : null),
    [graph.data, orientation],
  );

  const selectedSlug = params.get('position') ?? undefined;
  const selected = layout?.nodes.find((n) => n.slug === selectedSlug);
  const nameOf = (slug: string | null) =>
    slug ? (graph.data?.nodes.find((n) => n.slug === slug)?.name ?? slug) : null;

  const select = (slug: string) => {
    setParams(slug === selectedSlug ? {} : { position: slug }, { replace: true });
    // Phones: the panel is under the graph; bring it into view.
    if (orientation === 'vertical' && slug !== selectedSlug) {
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  };

  const fromHere: TechniqueLinkItem[] = selected
    ? (graph.data?.edges ?? [])
        .filter((e) => e.from === selected.slug)
        .map((e) => ({ technique: e.technique, other: nameOf(e.to) }))
    : [];
  const toHere: TechniqueLinkItem[] = selected
    ? (graph.data?.edges ?? [])
        .filter((e) => e.to === selected.slug)
        .map((e) => ({ technique: e.technique, other: nameOf(e.from) }))
    : [];

  return (
    <main className="mx-auto flex max-w-[1240px] flex-col gap-7 px-4 py-8 md:px-14 md:py-12">
      <title>Carte des positions · Tatamap</title>
      <meta
        name="description"
        content="La carte des positions du jiu-jitsu : gardes, positions du dessus, et les techniques qui les relient."
      />
      <PageHeader
        eyebrow="Vois comment tout s'enchaîne"
        title="La carte des positions"
        lead="Chaque position est un lieu, chaque technique un chemin. Choisis une position pour voir où elle mène."
      />

      {graph.isPending && <div className="aspect-[16/10] animate-pulse rounded-2xl bg-surface" />}
      {graph.isError && (
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-6">
          <p className="m-0">La carte n'a pas pu être chargée.</p>
          <button
            type="button"
            className={buttonClass('secondary')}
            onClick={() => graph.refetch()}
          >
            Réessayer
          </button>
        </div>
      )}

      {layout && (
        <div className="flex flex-wrap items-start gap-6">
          <section
            aria-label="Graphe des positions"
            className="flex min-w-0 flex-[2_1_560px] flex-col gap-4 rounded-2xl border border-line bg-surface-sunken p-3 md:p-5"
          >
            <div className="flex justify-between px-[4%] font-mono text-xs tracking-[0.1em] text-ink-muted">
              <span>DESSOUS</span>
              {orientation === 'horizontal' && <span>DESSUS</span>}
            </div>
            <GraphView layout={layout} selected={selected?.slug} onSelect={select} />
            {orientation === 'vertical' && (
              <span className="px-[4%] font-mono text-xs tracking-[0.1em] text-ink-muted">
                DESSUS
              </span>
            )}
            <ul
              aria-label="Légende"
              className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-[13px] text-ink-muted"
            >
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="size-3.5 rounded-full border-2 border-accent" />
                Tu es dessous
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="size-3.5 rounded-full bg-accent" />
                Tu es dessus
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="h-0.5 w-5 bg-[#4e7c70]" />
                Renversement ou prise du dos
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="font-mono text-opponent-soft">
                  soum.
                </span>
                Soumissions depuis la position
              </li>
            </ul>
          </section>

          <aside
            ref={panelRef}
            aria-live="polite"
            className="flex min-w-0 flex-[1_1_300px] scroll-mt-4 flex-col gap-4 rounded-2xl border border-line bg-surface p-6"
          >
            {selected ? (
              <>
                <p className="m-0 font-mono text-xs tracking-[0.1em] text-accent-bright uppercase">
                  Position · {POSITION_ROLE_LABELS_FR[selected.role]}
                </p>
                <h2 className="m-0 text-[28px] font-bold">{selected.name}</h2>
                {selected.description && (
                  <p className="m-0 text-[15px] leading-relaxed text-ink-muted">
                    {selected.description}
                  </p>
                )}
                {fromHere.length > 0 && (
                  <section className="flex flex-col gap-2.5">
                    <h3 className="m-0 text-sm font-bold">
                      {plural(fromHere.length, 'technique')} depuis cette position
                    </h3>
                    <TechniqueLinks techniques={fromHere} arrow="→" />
                  </section>
                )}
                {toHere.length > 0 && (
                  <section className="flex flex-col gap-2.5">
                    <h3 className="m-0 text-sm font-bold">Pour y arriver</h3>
                    <TechniqueLinks techniques={toHere} arrow="depuis" />
                  </section>
                )}
                {selected.techniqueCount > 0 && (
                  <Link
                    to={`/bibliotheque?position=${selected.slug}`}
                    className={buttonClass('secondary')}
                  >
                    Voir dans la bibliothèque
                  </Link>
                )}
              </>
            ) : (
              <>
                <h2 className="m-0 text-xl font-bold">Choisis une position</h2>
                <p className="m-0 text-[15px] leading-relaxed text-ink-muted">
                  Touche une position sur la carte pour voir les techniques qui en partent et celles
                  qui y mènent.
                </p>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {layout.nodes.map((n) => (
                    <li key={n.slug}>
                      <button
                        type="button"
                        onClick={() => select(n.slug)}
                        className={`min-h-11 rounded-full border border-line-strong bg-surface-sunken px-4 text-sm text-ink-soft hover:border-accent ${focusRing}`}
                      >
                        {n.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
