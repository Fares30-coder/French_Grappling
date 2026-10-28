import { describe, expect, it } from 'vitest';
import { buildTimeline, isStepEcho, sampleTimeline, timeAtStep } from './timeline';

const steps = [1300, 1300, 1300, 1300, 1300].map((transitionMs) => ({ transitionMs }));
const timeline = buildTimeline(steps);

describe('buildTimeline', () => {
  it('total = 5 holds + the transitions of steps 2 to 5', () => {
    expect(timeline.totalMs).toBe(5 * 1200 + 4 * 1300);
  });

  it('uses the transitionMs of the destination step', () => {
    const tl = buildTimeline(
      [{ transitionMs: 999 }, { transitionMs: 500 }, { transitionMs: 700 }],
      {
        holdMs: 100,
      },
    );
    expect(tl.totalMs).toBe(3 * 100 + 500 + 700);
  });
});

describe('sampleTimeline', () => {
  it('holds step 0 at the start', () => {
    expect(sampleTimeline(timeline, 0, { loop: true })).toEqual({
      stepIndex: 0,
      nextIndex: 0,
      t: 0,
    });
    expect(sampleTimeline(timeline, 1199, { loop: true }).t).toBe(0);
  });

  it('is at t = 0.5 in the middle of a transition', () => {
    const mid = 1200 + 650;
    expect(sampleTimeline(timeline, mid, { loop: true })).toEqual({
      stepIndex: 0,
      nextIndex: 1,
      t: 0.5,
    });
  });

  it('holds step 1 right after the first transition', () => {
    expect(sampleTimeline(timeline, 1200 + 1300, { loop: true })).toEqual({
      stepIndex: 1,
      nextIndex: 1,
      t: 0,
    });
  });

  it('loops with a hard cut back to step 0', () => {
    const lastHold = timeline.totalMs - 100;
    expect(sampleTimeline(timeline, lastHold, { loop: true })).toEqual({
      stepIndex: 4,
      nextIndex: 4,
      t: 0,
    });
    expect(sampleTimeline(timeline, timeline.totalMs + 10, { loop: true })).toEqual({
      stepIndex: 0,
      nextIndex: 0,
      t: 0,
    });
  });

  it('stays on the last step without loop', () => {
    expect(sampleTimeline(timeline, timeline.totalMs * 3, { loop: false })).toEqual({
      stepIndex: 4,
      nextIndex: 4,
      t: 0,
    });
  });

  it('handles an empty timeline', () => {
    expect(sampleTimeline(buildTimeline([]), 500, { loop: true })).toEqual({
      stepIndex: 0,
      nextIndex: 0,
      t: 0,
    });
  });
});

describe('timeAtStep', () => {
  it('returns the start of each hold', () => {
    expect(timeAtStep(timeline, 0)).toBe(0);
    expect(timeAtStep(timeline, 1)).toBe(1200 + 1300);
    expect(timeAtStep(timeline, 3)).toBe(3 * (1200 + 1300));
  });

  it('round-trips with sampleTimeline', () => {
    for (let i = 0; i < 5; i++) {
      expect(sampleTimeline(timeline, timeAtStep(timeline, i), { loop: true }).stepIndex).toBe(i);
    }
  });
});

describe('isStepEcho', () => {
  it('ignores the incoming index only when it equals the last emitted one', () => {
    expect(isStepEcho(1, 2, 2)).toBe(true);
    expect(isStepEcho(1, 2, 0)).toBe(false);
    expect(isStepEcho(1, null, 2)).toBe(false);
  });

  it('never ignores the very first index', () => {
    expect(isStepEcho(null, 0, 0)).toBe(false);
  });
});
