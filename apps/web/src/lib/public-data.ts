/** The only module that knows where public (read-only) data lives (ADR 0006 D3). */
export type PublicResource =
  | { kind: 'techniques' }
  | { kind: 'technique'; slug: string }
  | { kind: 'positions' }
  | { kind: 'graph' }
  | { kind: 'tags' };

/** Build-time constant: 'static' for the deployed site, 'api' (default) for local dev. */
const isStatic = (): boolean => import.meta.env.VITE_DATA_SOURCE === 'static';

export function publicUrl(resource: PublicResource): string {
  const slug = resource.kind === 'technique' ? encodeURIComponent(resource.slug) : '';
  if (isStatic()) {
    return resource.kind === 'technique'
      ? `/data/v1/techniques/${slug}.json`
      : `/data/v1/${resource.kind}.json`;
  }
  return resource.kind === 'technique' ? `/api/techniques/${slug}` : `/api/${resource.kind}`;
}
