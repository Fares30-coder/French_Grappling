import {
  CATEGORIES,
  type Category,
  LEVEL_LABELS_FR,
  LEVELS,
  type TechniqueListItem,
  techniqueMatchesQuery,
} from '@tatamap/shared';
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { buttonClass } from '../../ui/button';
import { Chip } from '../../ui/Chip';
import { PageHeader } from '../../ui/text';
import { ThumbnailPlayingProvider } from '../viewer/thumbnail-playing';
import { type FilterKey, hasFilters, readFilters, withFilter } from './filters';
import { TechniqueCard } from './TechniqueCard';
import { usePositions, useTechniqueList } from './use-catalog';

const ThumbnailCanvas = lazy(() =>
  import('../viewer/thumbnails').then((m) => ({ default: m.ThumbnailCanvas })),
);

const CATEGORY_PLURALS_FR: Record<Category, string> = {
  submission: 'Soumissions',
  pass: 'Passages de garde',
  sweep: 'Renversements',
  escape: 'Sorties',
  takedown: 'Projections',
};

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

type ChipOption = { value: string; label: string };

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: ChipOption[];
  selected: string | undefined;
  onToggle: (value: string | undefined) => void;
}) {
  if (options.length === 0) return null;
  // `relative`: the sr-only legend is absolutely positioned; without a positioned ancestor it
  // escapes the scrolling pill row and widens the whole page on phones.
  return (
    <fieldset className="relative m-0 flex shrink-0 gap-2 border-0 p-0 md:flex-wrap">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <Chip
          key={o.value}
          pressed={selected === o.value}
          onClick={() => onToggle(selected === o.value ? undefined : o.value)}
        >
          {o.label}
        </Chip>
      ))}
    </fieldset>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col">
      <dt className="order-2 text-[13px] text-ink-muted">{label}</dt>
      <dd className="m-0 text-3xl font-bold">{value}</dd>
    </div>
  );
}

function CardSkeletons() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-[18px]">
      {Array.from({ length: 6 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders, never reordered
        <div key={i} className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />
      ))}
    </div>
  );
}

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const list = useTechniqueList();
  const positions = usePositions();
  const searchId = useId();

  // Functional update: always build on the latest URL, not on this render's copy.
  const setFilter = (key: FilterKey | 'q', value: string | undefined) =>
    setParams((prev) => withFilter(prev, key, value), { replace: key === 'q' });

  // The search box owns its raw text (spaces included) and filters at once; the URL follows
  // 200 ms after the last keystroke. It adopts the URL's `q` only when no write is pending
  // (back/forward, a shared link, "Effacer les filtres").
  const urlQ = params.get('q') ?? '';
  const [searchText, setSearchText] = useState(urlQ);
  const pendingWrite = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pendingWrite.current === null) setSearchText(urlQ);
  }, [urlQ]);
  useEffect(() => () => clearTimeout(pendingWrite.current ?? undefined), []);
  const onSearch = (text: string) => {
    setSearchText(text);
    clearTimeout(pendingWrite.current ?? undefined);
    pendingWrite.current = setTimeout(() => {
      pendingWrite.current = null;
      setFilter('q', text);
    }, 200);
  };

  const query = useMemo(() => {
    const { q: _fromUrl, ...filters } = readFilters(params);
    const q = searchText.trim();
    return q ? { ...filters, q } : filters;
  }, [params, searchText]);

  const all = list.data?.techniques ?? [];
  const results = useMemo(() => all.filter((t) => techniqueMatchesQuery(t, query)), [all, query]);
  const filtered = hasFilters(query);

  // Only the options that lead somewhere, counted on the whole catalog.
  const count = (pred: (t: TechniqueListItem) => boolean) => all.filter(pred).length;
  const categoryOptions = CATEGORIES.map((c) => ({ c, n: count((t) => t.category === c) }))
    .filter(({ n }) => n > 0)
    .map(({ c, n }) => ({ value: c, label: `${CATEGORY_PLURALS_FR[c]} · ${n}` }));
  const positionOptions = (positions.data?.positions ?? [])
    .filter((p) => p.techniqueCount > 0)
    .map((p) => ({ value: p.slug, label: p.name }));
  const levelOptions = LEVELS.filter((l) => count((t) => t.level === l) > 0).map((l) => ({
    value: l,
    label: LEVEL_LABELS_FR[l],
  }));
  const giOptions = [
    { value: 'gi', label: 'Gi' },
    { value: 'nogi', label: 'No-gi' },
  ];

  return (
    <ThumbnailPlayingProvider>
      <title>Bibliothèque · Tatamap</title>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-8 md:px-16 md:py-14">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <PageHeader
            eyebrow="Ton espace d'apprentissage"
            title="La bibliothèque"
            lead="Chaque mouvement a sa place. Trouve le tien."
          />
          {list.data && positions.data && (
            <dl className="m-0 flex gap-9">
              <Stat value={all.length} label="techniques" />
              <Stat value={positions.data.positions.length} label="positions" />
              <Stat value={categoryOptions.length} label="catégories" />
            </dl>
          )}
        </div>

        <section aria-label="Recherche et filtres" className="flex flex-col gap-4">
          <label htmlFor={searchId} className="text-[15px] font-medium">
            Explorer les mouvements
          </label>
          <div className="flex min-h-13 items-center gap-3 rounded-xl border border-line-strong bg-surface px-4 focus-within:border-accent">
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="text-accent-bright"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              id={searchId}
              type="search"
              value={searchText}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Rechercher une technique, un tag…"
              className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
          {/* Phones: one scrolling row; desktop: wrapped groups. */}
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            <ChipGroup
              label="Catégorie"
              options={categoryOptions}
              selected={query.categorie}
              onToggle={(v) => setFilter('categorie', v)}
            />
            <span aria-hidden="true" className="mx-1.5 h-7 w-px shrink-0 bg-line-strong" />
            <ChipGroup
              label="Position de départ"
              options={positionOptions}
              selected={query.position}
              onToggle={(v) => setFilter('position', v)}
            />
            <span aria-hidden="true" className="mx-1.5 h-7 w-px shrink-0 bg-line-strong" />
            <ChipGroup
              label="Niveau"
              options={levelOptions}
              selected={query.niveau}
              onToggle={(v) => setFilter('niveau', v)}
            />
            <span aria-hidden="true" className="mx-1.5 h-7 w-px shrink-0 bg-line-strong" />
            <ChipGroup
              label="Gi ou no-gi"
              options={giOptions}
              selected={query.gi}
              onToggle={(v) => setFilter('gi', v)}
            />
          </div>
        </section>

        <section aria-labelledby="resultats" className="flex flex-col gap-[18px]">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="resultats" className="m-0 text-2xl font-bold">
              {filtered ? 'Résultats' : 'À explorer'}
            </h2>
            {list.data && (
              <span className="text-sm text-ink-muted" aria-live="polite">
                {plural(results.length, 'technique')}
              </span>
            )}
          </div>

          {list.isPending && <CardSkeletons />}

          {list.isError && (
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-6">
              <p className="m-0">La bibliothèque n'a pas pu être chargée.</p>
              <button
                type="button"
                className={buttonClass('secondary')}
                onClick={() => list.refetch()}
              >
                Réessayer
              </button>
            </div>
          )}

          {list.data && results.length === 0 && (
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-6">
              <p className="m-0 text-ink-muted">Aucune technique ne correspond à ta recherche.</p>
              <button
                type="button"
                className={buttonClass('secondary')}
                onClick={() => {
                  clearTimeout(pendingWrite.current ?? undefined);
                  pendingWrite.current = null;
                  setSearchText('');
                  setParams(new URLSearchParams(), { replace: true });
                }}
              >
                Effacer les filtres
              </button>
            </div>
          )}

          {results.length > 0 && (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-[18px] p-0">
              {results.map((t) => (
                <li key={t.slug} className="flex">
                  <TechniqueCard technique={t} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      {list.data && (
        <Suspense fallback={null}>
          <ThumbnailCanvas />
        </Suspense>
      )}
    </ThumbnailPlayingProvider>
  );
}
