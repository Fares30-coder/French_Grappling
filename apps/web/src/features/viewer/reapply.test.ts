import { describe, expect, it } from 'vitest';
import { shouldReapplyPose } from './reapply';

const base = { playing: false, stepIndexChanged: false, stepsChanged: false, isEcho: false };

describe('shouldReapplyPose', () => {
  it('re-applies when stopped and steps is a new reference', () => {
    expect(shouldReapplyPose({ ...base, stepsChanged: true })).toBe(true);
  });

  it('does not re-apply while playing when steps changes', () => {
    expect(shouldReapplyPose({ ...base, playing: true, stepsChanged: true })).toBe(false);
  });

  it('ignores the echo of onStepChange', () => {
    expect(shouldReapplyPose({ ...base, stepIndexChanged: true, isEcho: true })).toBe(false);
    expect(
      shouldReapplyPose({ ...base, playing: true, stepIndexChanged: true, isEcho: true }),
    ).toBe(false);
  });

  it('jumps to a step chosen from outside', () => {
    expect(shouldReapplyPose({ ...base, stepIndexChanged: true })).toBe(true);
    expect(shouldReapplyPose({ ...base, playing: true, stepIndexChanged: true })).toBe(true);
  });

  it('does nothing when nothing changed', () => {
    expect(shouldReapplyPose(base)).toBe(false);
  });
});
