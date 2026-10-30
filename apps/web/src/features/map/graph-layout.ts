import type { Graph, PositionListItem, TechniqueSummary } from '@tatamap/shared';

export type Orientation = 'horizontal' | 'vertical';

export type LaidNode = PositionListItem & {
  /** Centre, in viewBox units. */
  x: number;
  y: number;
  /** Submissions done from this position (edges without destination). */
  submissions: TechniqueSummary[];
};

export type LaidEdge = {
  from: string;
  to: string;
  techniques: TechniqueSummary[];
  /** SVG path (cubic), from the edge of one node to the edge of the other. */
  path: string;
  /** Where the technique names go (horizontal layout only), or null. */
  label: { x: number; y: number; text: string } | null;
};

export type GraphLayout = {
  width: number;
  height: number;
  /** Node diameter, in viewBox units. */
  nodeSize: number;
  nodes: LaidNode[];
  edges: LaidEdge[];
};

type Point = { x: number; y: number };

/**
 * Short name for the map's edge labels (the panel shows the full one): drops what the map
 * already says (the category, where it starts or leads) and asides.
 * "Renversement « old school »" -> "Old school", "Prise du dos par le sous-crochet" -> "Prise du dos".
 */
export function shortTechniqueName(name: string): string {
  const short = name
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/\s+(depuis|par|vers)\s.*$/i, '')
    .replace(/\s+et renversement$/i, '')
    .replace(/^renversement\s+/i, '')
    .replace(/^en\s+/i, '')
    .replace(/[«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return short ? short.charAt(0).toUpperCase() + short.slice(1) : name;
}

/** Longest edge label; beyond it the label gives the count (the panel lists the names). */
const MAX_LABEL_CHARS = 36;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'fr');

/** Point of the cubic Bézier p0-p1-p2-p3 at `t`. */
export function bezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

// Approximate label box in viewBox units (13 px text in a ~1000-unit-wide graph).
const LABEL_CHAR_W = 7.4;
const LABEL_PAD_W = 22;
const LABEL_H = 30;
const LABEL_T_CANDIDATES = [0.5, 0.38, 0.62, 0.3, 0.7, 0.24, 0.76];

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

/**
 * Lays out the position map. Bottom positions (you are underneath) on one side, top positions
 * on the other, neutral ones in between; horizontal = left to right (desktop), vertical = top to
 * bottom (phones, no labels). Bottom nodes are sorted by name; the others by the mean rank of
 * the positions leading to them (fewer crossings). Pure: easy to test, no DOM.
 */
export function layoutGraph(graph: Graph, orientation: Orientation): GraphLayout {
  const horizontal = orientation === 'horizontal';
  const bottom = graph.nodes.filter((n) => n.role === 'bottom').sort(byName);
  const rank = new Map(bottom.map((n, i) => [n.slug, i]));
  const barycentre = (slug: string): number => {
    const ranks = graph.edges
      .filter((e) => e.to === slug && rank.has(e.from))
      .map((e) => rank.get(e.from) ?? 0);
    return ranks.length
      ? ranks.reduce((a, b) => a + b, 0) / ranks.length
      : Number.POSITIVE_INFINITY;
  };
  const byBarycentre = (a: PositionListItem, b: PositionListItem) =>
    barycentre(a.slug) - barycentre(b.slug) || byName(a, b);
  const neutral = graph.nodes.filter((n) => n.role === 'neutral').sort(byBarycentre);
  const top = graph.nodes.filter((n) => n.role === 'top').sort(byBarycentre);
  const columns = [bottom, neutral, top].filter((c) => c.length > 0);
  const slots = Math.max(1, ...columns.map((c) => c.length));

  // Main axis: across the columns; cross axis: along a column.
  const mainLength = horizontal ? 1000 : 360;
  const slotLength = horizontal ? 190 : 120;
  const crossLength = horizontal ? slots * slotLength : 440;
  const nodeSize = horizontal ? 128 : 84;
  const radius = nodeSize / 2;
  const width = horizontal ? mainLength : Math.max(mainLength, slots * slotLength);
  const height = crossLength;

  const nodes: LaidNode[] = [];
  columns.forEach((column, ci) => {
    const main = columns.length === 1 ? 0.5 : 0.17 + (0.66 * ci) / (columns.length - 1); // 17% .. 83%
    column.forEach((node, i) => {
      const along = (i + 0.5) / column.length;
      const x = horizontal ? main * width : along * width;
      const y = horizontal ? along * height : main * height;
      nodes.push({
        ...node,
        x,
        y,
        submissions: graph.edges
          .filter((e) => e.from === node.slug && e.to === null)
          .map((e) => e.technique),
      });
    });
  });
  const at = new Map(nodes.map((n) => [n.slug, n]));

  // Group the techniques by (from, to): one curve per pair.
  const groups = new Map<string, LaidEdge>();
  for (const e of graph.edges) {
    if (e.to === null || !at.has(e.from) || !at.has(e.to)) continue;
    const key = `${e.from}>${e.to}`;
    const group = groups.get(key) ?? {
      from: e.from,
      to: e.to,
      techniques: [],
      path: '',
      label: null,
    };
    group.techniques.push(e.technique);
    groups.set(key, group);
  }

  const placed: Box[] = nodes.map((n) => ({ x: n.x, y: n.y, w: nodeSize, h: nodeSize }));
  const edges = [...groups.values()].map((edge) => {
    const a = at.get(edge.from) as LaidNode;
    const b = at.get(edge.to) as LaidNode;
    const gap = 6; // keeps the arrow head off the node
    let p0: Point;
    let p3: Point;
    let p1: Point;
    let p2: Point;
    if (horizontal) {
      const dir = Math.sign(b.x - a.x) || 1;
      p0 = { x: a.x + dir * (radius + gap), y: a.y };
      p3 = { x: b.x - dir * (radius + gap), y: b.y };
      const mid = (p0.x + p3.x) / 2;
      p1 = { x: mid, y: p0.y };
      p2 = { x: mid, y: p3.y };
    } else {
      const dir = Math.sign(b.y - a.y) || 1;
      p0 = { x: a.x, y: a.y + dir * (radius + gap) };
      p3 = { x: b.x, y: b.y - dir * (radius + gap) };
      const mid = (p0.y + p3.y) / 2;
      p1 = { x: p0.x, y: mid };
      p2 = { x: p3.x, y: mid };
    }
    const path = `M${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;

    let label: LaidEdge['label'] = null;
    if (horizontal) {
      const names = edge.techniques
        .map((t) => shortTechniqueName(t.name))
        .sort((x, y) => x.localeCompare(y, 'fr'))
        .join(' · ');
      const text = names.length <= MAX_LABEL_CHARS ? names : `${edge.techniques.length} techniques`;
      const w = text.length * LABEL_CHAR_W + LABEL_PAD_W;
      const boxAt = (t: number): Box => ({ ...bezierPoint(p0, p1, p2, p3, t), w, h: LABEL_H });
      const free = LABEL_T_CANDIDATES.map(boxAt).find(
        (box) => !placed.some((p) => overlaps(p, box)),
      );
      const box = free ?? boxAt(0.5);
      placed.push(box);
      label = { x: box.x, y: box.y, text };
    }
    return { ...edge, techniques: [...edge.techniques].sort(byName), path, label };
  });

  return { width, height, nodeSize, nodes, edges };
}
