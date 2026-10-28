import { DEFAULT_HOLD_MS } from '@tatamap/shared';

type Segment =
  | { kind: 'hold'; stepIndex: number; startMs: number; durationMs: number }
  | { kind: 'transition'; from: number; to: number; startMs: number; durationMs: number };

export type Timeline = { segments: ReadonlyArray<Segment>; totalMs: number };

export type TimelineSample = { stepIndex: number; nextIndex: number; t: number };

/**
 * [hold step 0][transition 0 -> 1][hold step 1]... [hold last step].
 * The transition into step i lasts steps[i].transitionMs.
 */
export function buildTimeline(
  steps: ReadonlyArray<{ transitionMs: number }>,
  { holdMs = DEFAULT_HOLD_MS }: { holdMs?: number } = {},
): Timeline {
  const segments: Segment[] = [];
  let cursor = 0;
  steps.forEach((step, i) => {
    if (i > 0) {
      segments.push({
        kind: 'transition',
        from: i - 1,
        to: i,
        startMs: cursor,
        durationMs: step.transitionMs,
      });
      cursor += step.transitionMs;
    }
    segments.push({ kind: 'hold', stepIndex: i, startMs: cursor, durationMs: holdMs });
    cursor += holdMs;
  });
  return { segments, totalMs: cursor };
}

/**
 * Where the animation is at `elapsedMs`. With `loop`, time wraps after the last hold and restarts
 * on step 0 with no interpolation from the last step to the first (hard cut). Without it, the
 * animation stays on the last step.
 */
export function sampleTimeline(
  timeline: Timeline,
  elapsedMs: number,
  { loop }: { loop: boolean },
): TimelineSample {
  const { segments, totalMs } = timeline;
  if (segments.length === 0 || totalMs <= 0) return { stepIndex: 0, nextIndex: 0, t: 0 };

  const time = loop
    ? ((elapsedMs % totalMs) + totalMs) % totalMs
    : Math.min(Math.max(elapsedMs, 0), totalMs);

  const segment = segments.find((s) => time < s.startMs + s.durationMs) ?? segments.at(-1);
  if (!segment) return { stepIndex: 0, nextIndex: 0, t: 0 };

  if (segment.kind === 'hold') {
    return { stepIndex: segment.stepIndex, nextIndex: segment.stepIndex, t: 0 };
  }
  const t = Math.min(1, (time - segment.startMs) / segment.durationMs);
  return { stepIndex: segment.from, nextIndex: segment.to, t };
}

/** Start time of the hold of step `index` (to jump to a step). */
export function timeAtStep(timeline: Timeline, index: number): number {
  for (const segment of timeline.segments) {
    if (segment.kind === 'hold' && segment.stepIndex === index) return segment.startMs;
  }
  return 0;
}

/**
 * True when an incoming `stepIndex` is just the parent echoing the last index we emitted
 * (so it must not make the viewer jump). Never true before the first pose is shown.
 */
export function isStepEcho(
  shown: number | null,
  lastEmitted: number | null,
  incoming: number,
): boolean {
  return shown !== null && lastEmitted === incoming;
}
