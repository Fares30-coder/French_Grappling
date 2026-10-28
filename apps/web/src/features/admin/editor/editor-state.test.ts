import {
  type AdminTechnique,
  adminTechniqueSchema,
  type CurrentPose,
  mirrorPose,
  POSE_BOUNDS_CM,
  STARTER_POSE,
  techniqueUpdateInputSchema,
} from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import {
  currentPublishIssues,
  currentWarnings,
  type EditorAction,
  type EditorState,
  editorReducer,
  HISTORY_LIMIT,
  initialEditorState,
  isDirty,
  MAX_STEPS,
  toUpdateInput,
} from './editor-state';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A pose that differs from STARTER_POSE (so mirror / copy are observable). */
const movedPose = (dx: number): CurrentPose => ({
  ...STARTER_POSE,
  fighters: {
    ...STARTER_POSE.fighters,
    me: { ...STARTER_POSE.fighters.me, handL: [-15 + dx, 128, -15] },
  },
});

function technique(stepCount = 3): AdminTechnique {
  return adminTechniqueSchema.parse({
    id: id(1),
    version: 4,
    status: 'draft',
    publishedAt: null,
    updatedAt: '2026-10-28T10:00:00.000Z',
    slug: 'ciseau-test',
    name: 'Ciseau de test',
    category: 'sweep',
    level: 'beginner',
    gi: 'both',
    startPositionId: id(2),
    endPositionId: id(3),
    keyPoints: ['Un point clé'],
    commonMistakes: [],
    tagIds: [id(4)],
    steps: Array.from({ length: stepCount }, (_, i) => ({
      title: `Étape ${i + 1}`,
      text: '',
      transitionMs: 1300,
      pose: movedPose(i * 10),
    })),
    chains: [{ toId: id(5), type: 'followup' }],
  });
}

const run = (state: EditorState, ...actions: EditorAction[]): EditorState =>
  actions.reduce(editorReducer, state);
const fresh = (stepCount?: number) => initialEditorState(technique(stepCount));
const handL = (state: EditorState, step = state.stepIndex) =>
  state.technique.steps[step]?.pose.fighters.me.handL;
const ME_HAND = { fighter: 'me', joint: 'handL' } as const;

describe('addStepAfter', () => {
  it('inserts a deep copy of the current pose after the current step and selects it', () => {
    let state = run(fresh(), { type: 'selectStep', index: 1 }, { type: 'addStepAfter' });
    expect(state.technique.steps).toHaveLength(4);
    expect(state.stepIndex).toBe(2);
    const added = state.technique.steps[2];
    expect(added).toMatchObject({ title: 'Étape 3', text: '', transitionMs: 1300 });
    expect(added?.pose).toEqual(state.technique.steps[1]?.pose);
    // Editing the copy leaves the original alone.
    state = run(state, { type: 'setJoint', joint: ME_HAND, position: [1, 2, 3] });
    expect(handL(state, 2)).toEqual([1, 2, 3]);
    expect(handL(state, 1)).toEqual([-5, 128, -15]);
    expect(state.technique.steps[2]?.pose).not.toBe(state.technique.steps[1]?.pose);
  });

  it('does not go past 40 steps', () => {
    const state = run(fresh(MAX_STEPS), { type: 'addStepAfter' });
    expect(state.technique.steps).toHaveLength(MAX_STEPS);
  });
});

describe('removeStep / moveStep', () => {
  it('keeps the last remaining step', () => {
    const state = fresh(1);
    expect(editorReducer(state, { type: 'removeStep', index: 0 })).toBe(state);
  });

  it('keeps stepIndex on the same step when an earlier one is removed', () => {
    const state = run(fresh(), { type: 'selectStep', index: 2 }, { type: 'removeStep', index: 0 });
    expect(state.technique.steps.map((s) => s.title)).toEqual(['Étape 2', 'Étape 3']);
    expect(state.stepIndex).toBe(1);
    const last = run(fresh(), { type: 'selectStep', index: 2 }, { type: 'removeStep', index: 2 });
    expect(last.stepIndex).toBe(1);
  });

  it('moves a step and follows it with stepIndex', () => {
    let state = run(
      fresh(),
      { type: 'selectStep', index: 0 },
      { type: 'moveStep', index: 0, direction: 1 },
    );
    expect(state.technique.steps.map((s) => s.title)).toEqual(['Étape 2', 'Étape 1', 'Étape 3']);
    expect(state.stepIndex).toBe(1);
    // The neighbour that is swapped with the current step shifts the index the other way.
    state = run(state, { type: 'moveStep', index: 0, direction: 1 });
    expect(state.technique.steps.map((s) => s.title)).toEqual(['Étape 1', 'Étape 2', 'Étape 3']);
    expect(state.stepIndex).toBe(0);
    // Out of range: unchanged.
    expect(editorReducer(state, { type: 'moveStep', index: 0, direction: -1 })).toBe(state);
    expect(editorReducer(state, { type: 'moveStep', index: 2, direction: 1 })).toBe(state);
  });
});

describe('joint drag', () => {
  it('is one undo entry for begin + 30 setJoint + end', () => {
    const start = fresh();
    const original = handL(start);
    let state = run(start, { type: 'beginJointDrag' });
    for (let i = 1; i <= 30; i++) {
      state = run(state, { type: 'setJoint', joint: ME_HAND, position: [i, 100, 0] });
    }
    state = run(state, { type: 'endJointDrag' });
    expect(handL(state)).toEqual([30, 100, 0]);
    expect(state.history.past).toHaveLength(1);
    state = run(state, { type: 'undo' });
    expect(handL(state)).toEqual(original);
    expect(state.history.past).toHaveLength(0);
    state = run(state, { type: 'redo' });
    expect(handL(state)).toEqual([30, 100, 0]);
  });

  it('adds no undo entry for a click without movement', () => {
    const state = run(fresh(), { type: 'beginJointDrag' }, { type: 'endJointDrag' });
    expect(state.history.past).toHaveLength(0);
    expect(isDirty(state)).toBe(false);
  });

  it('clamps joints to the pose bounds', () => {
    const state = run(fresh(), {
      type: 'setJoint',
      joint: ME_HAND,
      position: [9999, -50, -9999],
    });
    expect(handL(state)).toEqual([POSE_BOUNDS_CM.x.max, 0, POSE_BOUNDS_CM.z.min]);
  });

  it('ignores undo and redo while dragging', () => {
    let state = run(fresh(), { type: 'setJoint', joint: ME_HAND, position: [1, 1, 1] });
    state = run(state, { type: 'beginJointDrag' });
    expect(editorReducer(state, { type: 'undo' })).toBe(state);
  });
});

describe('undo / redo', () => {
  it('restore exactly, and a new edit clears the redo stack', () => {
    const start = fresh();
    let state = run(start, { type: 'setMeta', patch: { name: 'A' } });
    state = run(state, { type: 'addStepAfter' });
    const afterTwo = state.technique;
    state = run(state, { type: 'undo' });
    expect(state.technique.steps).toHaveLength(3);
    state = run(state, { type: 'undo' });
    expect(state.technique).toEqual(start.technique);
    state = run(state, { type: 'redo' }, { type: 'redo' });
    expect(state.technique).toEqual(afterTwo);
    state = run(state, { type: 'undo' }, { type: 'setMeta', patch: { name: 'B' } });
    expect(state.history.future).toHaveLength(0);
  });

  it('do nothing on empty stacks, and clamp stepIndex when steps disappear', () => {
    const start = fresh();
    expect(editorReducer(start, { type: 'undo' })).toBe(start);
    expect(editorReducer(start, { type: 'redo' })).toBe(start);
    let state = run(start, { type: 'selectStep', index: 2 }, { type: 'addStepAfter' });
    expect(state.stepIndex).toBe(3);
    state = run(state, { type: 'undo' });
    expect(state.stepIndex).toBe(2);
    state = run(fresh(1), { type: 'addStepAfter' }, { type: 'addStepAfter' });
    state = run(state, { type: 'undo' }, { type: 'undo' });
    expect(state.stepIndex).toBe(0);
  });

  it('keeps at most 100 entries', () => {
    let state = fresh();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      state = run(state, { type: 'setStepField', index: 0, field: 'transitionMs', value: 200 + i });
      state = run(state, { type: 'selectStep', index: 0 }); // breaks the typing run
    }
    expect(state.history.past).toHaveLength(HISTORY_LIMIT);
  });

  it('merges consecutive edits of the same field (typing) into one entry', () => {
    let state = fresh();
    for (const text of ['a', 'ab', 'abc']) {
      state = run(state, { type: 'setStepField', index: 0, field: 'text', value: text });
    }
    expect(state.history.past).toHaveLength(1);
    state = run(state, { type: 'setStepField', index: 0, field: 'title', value: 'T' });
    expect(state.history.past).toHaveLength(2);
    state = run(state, { type: 'undo' }, { type: 'undo' });
    expect(state.technique.steps[0]?.text).toBe('');
  });
});

describe('setMeta', () => {
  it('forces endPositionId to null when the category becomes submission', () => {
    const state = run(fresh(), { type: 'setMeta', patch: { category: 'submission' } });
    expect(state.technique.category).toBe('submission');
    expect(state.technique.endPositionId).toBeNull();
    // ... even if the same patch tries to set one.
    const again = run(fresh(), {
      type: 'setMeta',
      patch: { category: 'submission', endPositionId: id(3) },
    });
    expect(again.technique.endPositionId).toBeNull();
    // Editing the end position of a submission is ignored too.
    const ignored = run(state, { type: 'setMeta', patch: { endPositionId: id(3) } });
    expect(ignored.technique.endPositionId).toBeNull();
  });
});

describe('isDirty', () => {
  it('is false after saved, true after a change, false again after undo back to the saved state', () => {
    let state = fresh();
    expect(isDirty(state)).toBe(false);
    state = run(state, { type: 'setStepField', index: 1, field: 'title', value: 'Nouveau' });
    expect(isDirty(state)).toBe(true);
    state = run(state, { type: 'saved', version: 5, revision: state.revision });
    expect(isDirty(state)).toBe(false);
    expect(state.version).toBe(5);
    state = run(state, { type: 'setStepField', index: 1, field: 'title', value: 'Autre' });
    expect(isDirty(state)).toBe(true);
    state = run(state, { type: 'undo' });
    expect(isDirty(state)).toBe(false);
    state = run(state, { type: 'redo' });
    expect(isDirty(state)).toBe(true);
  });

  it('stays dirty when edits were made while the save was in flight', () => {
    let state = run(fresh(), { type: 'setMeta', patch: { name: 'A' } });
    const sent = state.revision;
    state = run(state, { type: 'setMeta', patch: { name: 'AB' } });
    state = run(state, { type: 'saved', version: 5, revision: sent });
    expect(isDirty(state)).toBe(true);
  });

  it('does not put a stale version back on undo', () => {
    let state = run(fresh(), { type: 'setMeta', patch: { name: 'A' } });
    state = run(state, { type: 'saved', version: 9, revision: state.revision });
    state = run(state, { type: 'undo' });
    expect(toUpdateInput(state).version).toBe(9);
  });
});

describe('copyPreviousPose / mirror / camera', () => {
  it('copies the previous pose but keeps the current camera', () => {
    const camera = { position: [1, 2, 3], target: [4, 5, 6] } as const;
    let state = run(
      fresh(),
      { type: 'selectStep', index: 1 },
      {
        type: 'setStepCamera',
        camera: { position: [...camera.position], target: [...camera.target] },
      },
      { type: 'copyPreviousPose' },
    );
    expect(handL(state, 1)).toEqual(handL(state, 0));
    expect(state.technique.steps[1]?.pose.camera).toEqual(camera);
    // Nothing to copy on step 1.
    state = run(state, { type: 'selectStep', index: 0 });
    expect(editorReducer(state, { type: 'copyPreviousPose' })).toBe(state);
  });

  it('mirrors one step or all of them', () => {
    const start = fresh();
    const one = run(start, { type: 'selectStep', index: 1 }, { type: 'mirror', scope: 'step' });
    expect(one.technique.steps[1]?.pose).toEqual(
      mirrorPose(start.technique.steps[1]?.pose as CurrentPose),
    );
    expect(one.technique.steps[0]?.pose).toEqual(start.technique.steps[0]?.pose);
    const all = run(start, { type: 'mirror', scope: 'all' });
    all.technique.steps.forEach((s, i) => {
      expect(s.pose).toEqual(mirrorPose(start.technique.steps[i]?.pose as CurrentPose));
    });
    // Mirroring twice is the identity, and one undo undoes one mirror.
    const twice = run(all, { type: 'mirror', scope: 'all' });
    expect(twice.technique).toEqual(start.technique);
    expect(run(all, { type: 'undo' }).technique).toEqual(start.technique);
  });

  it('sets, clamps and removes the camera hint', () => {
    let state = run(fresh(), {
      type: 'setStepCamera',
      camera: { position: [5000, -10, 0], target: [0, 0, -5000] },
    });
    expect(state.technique.steps[0]?.pose.camera).toEqual({
      position: [2000, 0, 0],
      target: [0, 0, -2000],
    });
    expect(techniqueUpdateInputSchema.safeParse(toUpdateInput(state)).success).toBe(true);
    state = run(state, { type: 'setStepCamera', camera: undefined });
    expect(state.technique.steps[0]?.pose).not.toHaveProperty('camera');
  });
});

describe('selectors', () => {
  it('toUpdateInput passes techniqueUpdateInputSchema for a loaded state, and after edits', () => {
    const state = fresh();
    expect(techniqueUpdateInputSchema.safeParse(toUpdateInput(state)).success).toBe(true);
    expect(toUpdateInput(state).version).toBe(4);
    const edited = run(
      state,
      { type: 'addStepAfter' },
      { type: 'setStepField', index: 1, field: 'title', value: '  Titre  ' },
      { type: 'setMeta', patch: { category: 'submission' } },
      { type: 'mirror', scope: 'all' },
    );
    const parsed = techniqueUpdateInputSchema.safeParse(toUpdateInput(edited));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.steps[1]?.title).toBe('Titre'); // trimmed by the schema
    expect(parsed.data?.steps).toHaveLength(4);
  });

  it('currentWarnings compares with the standard body, step 1 included', () => {
    let state = fresh();
    expect(currentWarnings(state)).toEqual([]);
    // Stretch the left hand far away: the left forearm warns, even on step 1.
    state = run(state, { type: 'setJoint', joint: ME_HAND, position: [200, 100, 0] });
    expect(currentWarnings(state)).not.toEqual([]);
    const warnings = currentWarnings(state);
    expect(warnings.some((w) => w.fighter === 'me' && w.bone === 'elbowL-handL')).toBe(true);
    expect(warnings.find((w) => w.bone === 'elbowL-handL')?.referenceCm).toBe(33);
    // Step 2 was not touched: its own bones are what counts, not step 1's.
    state = run(state, { type: 'selectStep', index: 1 });
    expect(
      currentWarnings(state).every((w) => w.fighter === 'me' && w.bone === 'elbowL-handL'),
    ).toBe(true);
  });

  it('currentPublishIssues follows the content', () => {
    expect(currentPublishIssues(fresh())).toEqual([]);
    expect(
      currentPublishIssues(run(fresh(), { type: 'setMeta', patch: { keyPoints: [] } })),
    ).toHaveLength(1);
    expect(currentPublishIssues(fresh(1))).toHaveLength(1);
  });
});
