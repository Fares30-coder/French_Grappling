import type { Graph } from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import { bezierPoint, layoutGraph, shortTechniqueName } from './graph-layout';

const node = (slug: string, name: string, role: 'top' | 'bottom' | 'neutral', count = 0) => ({
  slug,
  name,
  role,
  description: '',
  techniqueCount: count,
});
const tech = (slug: string, name: string, category: 'sweep' | 'submission' = 'sweep') => ({
  slug,
  name,
  category,
  level: 'beginner' as const,
  gi: 'both' as const,
});

const graph: Graph = {
  nodes: [
    node('montee', 'Montée', 'top'),
    node('dos', 'Dos', 'top'),
    node('garde-fermee', 'Garde fermée', 'bottom', 3),
    node('demi-garde', 'Demi-garde', 'bottom', 1),
  ],
  edges: [
    { technique: tech('ciseau', 'Ciseau'), from: 'garde-fermee', to: 'montee' },
    { technique: tech('hanche', 'Poussée de hanche'), from: 'garde-fermee', to: 'montee' },
    { technique: tech('cle', 'Clé de bras', 'submission'), from: 'garde-fermee', to: null },
    { technique: tech('dos', 'Prise du dos'), from: 'demi-garde', to: 'dos' },
  ],
};

describe('layoutGraph', () => {
  it('puts bottom positions on the left, top ones on the right (horizontal)', () => {
    const { nodes } = layoutGraph(graph, 'horizontal');
    const x = (slug: string) => nodes.find((n) => n.slug === slug)?.x ?? Number.NaN;
    expect(x('garde-fermee')).toBeLessThan(x('montee'));
    expect(x('demi-garde')).toBe(x('garde-fermee'));
  });

  it('orders the top column after the positions leading to it (fewer crossings)', () => {
    const { nodes } = layoutGraph(graph, 'horizontal');
    const y = (slug: string) => nodes.find((n) => n.slug === slug)?.y ?? Number.NaN;
    // Bottom sorted by name: Demi-garde above Garde fermée; so Dos above Montée.
    expect(y('demi-garde')).toBeLessThan(y('garde-fermee'));
    expect(y('dos')).toBeLessThan(y('montee'));
  });

  it('groups techniques per pair, keeps submissions on their node', () => {
    const layout = layoutGraph(graph, 'horizontal');
    const toMount = layout.edges.find((e) => e.to === 'montee');
    expect(toMount?.techniques.map((t) => t.name)).toEqual(['Ciseau', 'Poussée de hanche']);
    expect(toMount?.label?.text).toBe('Ciseau · Poussée de hanche');
    expect(layout.edges).toHaveLength(2);
    const closed = layout.nodes.find((n) => n.slug === 'garde-fermee');
    expect(closed?.submissions.map((t) => t.name)).toEqual(['Clé de bras']);
  });

  it('lays out top to bottom without labels on phones', () => {
    const { nodes, edges } = layoutGraph(graph, 'vertical');
    const y = (slug: string) => nodes.find((n) => n.slug === slug)?.y ?? Number.NaN;
    expect(y('garde-fermee')).toBeLessThan(y('montee'));
    expect(edges.every((e) => e.label === null)).toBe(true);
  });

  it('does not stack two labels on the same spot', () => {
    const crossing: Graph = {
      nodes: [
        node('a', 'A', 'bottom'),
        node('b', 'B', 'bottom'),
        node('c', 'C', 'top'),
        node('d', 'D', 'top'),
      ],
      edges: [
        { technique: tech('t1', 'Un nom assez long'), from: 'a', to: 'd' },
        { technique: tech('t2', 'Un autre nom long'), from: 'b', to: 'c' },
      ],
    };
    const [l1, l2] = layoutGraph(crossing, 'horizontal').edges.map((e) => e.label);
    expect(l1 && l2 && (Math.abs(l1.x - l2.x) > 1 || Math.abs(l1.y - l2.y) > 1)).toBe(true);
  });
});

describe('bezierPoint', () => {
  it('starts and ends on the end points', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ] as const;
    expect(bezierPoint(...p, 0)).toEqual({ x: 0, y: 0 });
    expect(bezierPoint(...p, 1)).toEqual({ x: 2, y: 1 });
  });
});

describe('shortTechniqueName', () => {
  it('drops the category, the start or end, and asides', () => {
    expect(shortTechniqueName('Renversement « old school »')).toBe('Old school');
    expect(shortTechniqueName('Renversement « waiter » (demi-garde profonde)')).toBe('Waiter');
    expect(shortTechniqueName('Renversement en poussée de hanche')).toBe('Poussée de hanche');
    expect(shortTechniqueName('Ciseau depuis la garde fermée')).toBe('Ciseau');
    expect(shortTechniqueName('Prise du dos par le sous-crochet')).toBe('Prise du dos');
    expect(shortTechniqueName('Arm drag vers le dos')).toBe('Arm drag');
    expect(shortTechniqueName('Passage en garde X et renversement')).toBe('Passage en garde X');
    expect(shortTechniqueName('Renversement papillon')).toBe('Papillon');
  });
});
