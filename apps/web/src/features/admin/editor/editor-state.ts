import {
  type AdminTechnique,
  type CameraHint,
  type CurrentPose,
  clampVec3,
  DEFAULT_TRANSITION_MS,
  type FighterId,
  type JointV1_11,
  mirrorPose,
  publishIssues,
  type StandardBodyWarning,
  type StepInput,
  standardBodyWarnings,
  type TechniqueUpdateInput,
  type Vec3,
} from '@tatamap/shared';

/** The editable content of a technique (no id, status, dates, nor version: see EditorState). */
export type EditorTechnique = Omit<TechniqueUpdateInput, 'version'>;
export type EditorStep = StepInput;
export type JointRef = { fighter: FighterId; joint: JointV1_11 };

/** Same limits as techniqueUpdateInputSchema. */
export const MAX_STEPS = 40;
export const HISTORY_LIMIT = 100;

type Snapshot = { technique: EditorTechnique; revision: number };

export type EditorState = {
  technique: EditorTechnique;
  /** Optimistic-concurrency token of the last load/save; kept out of the history on purpose. */
  version: number;
  stepIndex: number;
  selectedJoint: JointRef | null;
  history: { past: ReadonlyArray<Snapshot>; future: ReadonlyArray<Snapshot> };
  /** Identifies the current content; every change gets a new one, undo/redo restore the old one. */
  revision: number;
  /** Revision that was last saved: the state is dirty while `revision` differs. */
  savedRevision: number;
  nextRevision: number;
  /** Key of the last edit, so that typing in one field is a single undo entry. */
  lastEditKey: string | null;
  /** A joint drag is in progress; `pushed` once its undo entry exists. */
  drag: { pushed: boolean } | null;
};

export type MetaPatch = Partial<
  Pick<
    EditorTechnique,
    | 'slug'
    | 'name'
    | 'category'
    | 'level'
    | 'gi'
    | 'startPositionId'
    | 'endPositionId'
    | 'keyPoints'
    | 'commonMistakes'
    | 'tagIds'
    | 'chains'
  >
>;
export type StepFieldPatch =
  | { field: 'title'; value: string }
  | { field: 'text'; value: string }
  | { field: 'transitionMs'; value: number };

export type EditorAction =
  | { type: 'loaded'; technique: AdminTechnique }
  | { type: 'setMeta'; patch: MetaPatch }
  | { type: 'selectStep'; index: number }
  | { type: 'addStepAfter' }
  | { type: 'removeStep'; index: number }
  | { type: 'moveStep'; index: number; direction: -1 | 1 }
  | ({ type: 'setStepField'; index: number } & StepFieldPatch)
  | { type: 'beginJointDrag' }
  | { type: 'setJoint'; joint: JointRef; position: Vec3 }
  | { type: 'endJointDrag' }
  | { type: 'copyPreviousPose' }
  | { type: 'mirror'; scope: 'step' | 'all' }
  | { type: 'setStepCamera'; camera: CameraHint | undefined }
  | { type: 'selectJoint'; joint: JointRef | null }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; version: number; revision: number };

const clonePose = (pose: CurrentPose): CurrentPose => structuredClone(pose);

export function toEditorTechnique(t: AdminTechnique): EditorTechnique {
  return {
    slug: t.slug,
    name: t.name,
    category: t.category,
    level: t.level,
    gi: t.gi,
    startPositionId: t.startPositionId,
    endPositionId: t.endPositionId,
    keyPoints: [...t.keyPoints],
    commonMistakes: [...t.commonMistakes],
    tagIds: [...t.tagIds],
    steps: t.steps.map((s) => ({
      title: s.title,
      text: s.text,
      transitionMs: s.transitionMs,
      pose: clonePose(s.pose),
    })),
    chains: t.chains.map((c) => ({ toId: c.toId, type: c.type })),
  };
}

export function initialEditorState(loaded: AdminTechnique): EditorState {
  return {
    technique: toEditorTechnique(loaded),
    version: loaded.version,
    stepIndex: 0,
    selectedJoint: null,
    history: { past: [], future: [] },
    revision: 0,
    savedRevision: 0,
    nextRevision: 1,
    lastEditKey: null,
    drag: null,
  };
}

const clampIndex = (index: number, length: number): number =>
  Math.min(Math.max(index, 0), Math.max(length - 1, 0));

const capped = (past: ReadonlyArray<Snapshot>): ReadonlyArray<Snapshot> =>
  past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past;

/**
 * Applies an edit: pushes an undo entry (unless `key` continues the previous edit), clears redo
 * and gives the new content a fresh revision.
 */
function commit(
  state: EditorState,
  technique: EditorTechnique,
  key: string | null,
  extra: Partial<EditorState> = {},
): EditorState {
  const coalesce = key !== null && key === state.lastEditKey;
  const past = coalesce
    ? state.history.past
    : capped([...state.history.past, { technique: state.technique, revision: state.revision }]);
  return {
    ...state,
    technique,
    history: { past, future: [] },
    revision: state.nextRevision,
    nextRevision: state.nextRevision + 1,
    lastEditKey: key,
    ...extra,
  };
}

const withStep = (
  technique: EditorTechnique,
  index: number,
  change: (step: EditorStep) => EditorStep,
): EditorTechnique => ({
  ...technique,
  steps: technique.steps.map((s, i) => (i === index ? change(s) : s)),
});

const withPose = (step: EditorStep, pose: CurrentPose): EditorStep => ({ ...step, pose });

function setJointInPose(pose: CurrentPose, ref: JointRef, position: Vec3): CurrentPose {
  return {
    ...pose,
    fighters: {
      ...pose.fighters,
      [ref.fighter]: { ...pose.fighters[ref.fighter], [ref.joint]: clampVec3(position) },
    },
  };
}

const camCoord = (v: number, min = -2000): number => Math.min(2000, Math.max(min, v));
/** Keeps a captured camera inside what cameraSchema accepts. */
function clampCamera(camera: CameraHint): CameraHint {
  const [px, py, pz] = camera.position;
  const [tx, ty, tz] = camera.target;
  return {
    position: [camCoord(px), camCoord(py, 0), camCoord(pz)],
    target: [camCoord(tx), camCoord(ty), camCoord(tz)],
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  // Anything but a text/field edit ends the current "typing" run.
  const breakRun = (next: Partial<EditorState> = {}): EditorState => ({
    ...state,
    lastEditKey: null,
    ...next,
  });
  const { technique } = state;

  switch (action.type) {
    case 'loaded':
      return initialEditorState(action.technique);

    case 'setMeta': {
      const patch: MetaPatch = { ...action.patch };
      const category = patch.category ?? technique.category;
      // A submission has no end position.
      if (category === 'submission') patch.endPositionId = null;
      const keys = Object.keys(patch).sort().join(',');
      return commit(state, { ...technique, ...patch }, `meta:${keys}`);
    }

    case 'selectStep':
      return breakRun({ stepIndex: clampIndex(action.index, technique.steps.length) });

    case 'addStepAfter': {
      if (technique.steps.length >= MAX_STEPS) return state;
      const current = technique.steps[state.stepIndex];
      if (!current) return state;
      const at = state.stepIndex + 1;
      const added: EditorStep = {
        title: `Étape ${at + 1}`,
        text: '',
        transitionMs: DEFAULT_TRANSITION_MS,
        pose: clonePose(current.pose),
      };
      const steps = [...technique.steps.slice(0, at), added, ...technique.steps.slice(at)];
      return commit(state, { ...technique, steps }, null, { stepIndex: at });
    }

    case 'removeStep': {
      if (technique.steps.length <= 1) return state;
      if (action.index < 0 || action.index >= technique.steps.length) return state;
      const steps = technique.steps.filter((_, i) => i !== action.index);
      const stepIndex =
        action.index < state.stepIndex
          ? state.stepIndex - 1
          : clampIndex(state.stepIndex, steps.length);
      return commit(state, { ...technique, steps }, null, { stepIndex });
    }

    case 'moveStep': {
      const from = action.index;
      const to = from + action.direction;
      if (from < 0 || from >= technique.steps.length) return state;
      if (to < 0 || to >= technique.steps.length) return state;
      const steps = [...technique.steps];
      const a = steps[from];
      const b = steps[to];
      if (!a || !b) return state;
      steps[from] = b;
      steps[to] = a;
      const stepIndex =
        state.stepIndex === from ? to : state.stepIndex === to ? from : state.stepIndex;
      return commit(state, { ...technique, steps }, null, { stepIndex });
    }

    case 'setStepField': {
      if (action.index < 0 || action.index >= technique.steps.length) return state;
      const { field, value } = action;
      return commit(
        state,
        withStep(technique, action.index, (s) => ({ ...s, [field]: value })),
        `step:${action.index}:${field}`,
      );
    }

    case 'beginJointDrag':
      return state.drag ? state : breakRun({ drag: { pushed: false } });

    case 'setJoint': {
      const step = technique.steps[state.stepIndex];
      if (!step) return state;
      const pose = setJointInPose(step.pose, action.joint, action.position);
      const next = withStep(technique, state.stepIndex, (s) => withPose(s, pose));
      if (state.drag) {
        if (!state.drag.pushed) {
          // First movement of the drag: one undo entry for the whole gesture.
          return commit(state, next, null, { drag: { pushed: true } });
        }
        return {
          ...state,
          technique: next,
          revision: state.nextRevision,
          nextRevision: state.nextRevision + 1,
        };
      }
      // Typed in the numeric panel: consecutive edits of the same joint are one undo entry.
      return commit(
        state,
        next,
        `joint:${state.stepIndex}:${action.joint.fighter}:${action.joint.joint}`,
      );
    }

    case 'endJointDrag':
      return state.drag ? breakRun({ drag: null }) : state;

    case 'copyPreviousPose': {
      const previous = technique.steps[state.stepIndex - 1];
      if (!previous) return state;
      // Fighters only: the current step keeps its own camera.
      return commit(
        state,
        withStep(technique, state.stepIndex, (s) =>
          withPose(s, {
            ...clonePose(previous.pose),
            ...(s.pose.camera ? { camera: s.pose.camera } : {}),
          }),
        ),
        null,
      );
    }

    case 'mirror': {
      const steps = technique.steps.map((s, i) =>
        action.scope === 'all' || i === state.stepIndex ? withPose(s, mirrorPose(s.pose)) : s,
      );
      return commit(state, { ...technique, steps }, null);
    }

    case 'setStepCamera': {
      const step = technique.steps[state.stepIndex];
      if (!step) return state;
      const pose: CurrentPose = { ...step.pose };
      if (action.camera) pose.camera = clampCamera(action.camera);
      else delete pose.camera;
      return commit(
        state,
        withStep(technique, state.stepIndex, (s) => withPose(s, pose)),
        null,
      );
    }

    case 'selectJoint':
      return breakRun({ selectedJoint: action.joint });

    case 'undo': {
      const previous = state.history.past[state.history.past.length - 1];
      if (!previous || state.drag) return state;
      return {
        ...state,
        technique: previous.technique,
        revision: previous.revision,
        stepIndex: clampIndex(state.stepIndex, previous.technique.steps.length),
        history: {
          past: state.history.past.slice(0, -1),
          future: [...state.history.future, { technique, revision: state.revision }],
        },
        lastEditKey: null,
      };
    }

    case 'redo': {
      const next = state.history.future[state.history.future.length - 1];
      if (!next || state.drag) return state;
      return {
        ...state,
        technique: next.technique,
        revision: next.revision,
        stepIndex: clampIndex(state.stepIndex, next.technique.steps.length),
        history: {
          past: capped([...state.history.past, { technique, revision: state.revision }]),
          future: state.history.future.slice(0, -1),
        },
        lastEditKey: null,
      };
    }

    case 'saved':
      // `revision` is the one that was sent: edits made while the request was in flight stay dirty.
      return breakRun({ version: action.version, savedRevision: action.revision });
  }
}

// ---------------------------------------------------------------- selectors

export const isDirty = (state: EditorState): boolean => state.revision !== state.savedRevision;

/** The body of PUT /api/admin/techniques/:id (before the schema trims and checks it). */
export function toUpdateInput(state: EditorState): TechniqueUpdateInput {
  const t = state.technique;
  return {
    version: state.version,
    slug: t.slug,
    name: t.name,
    category: t.category,
    level: t.level,
    gi: t.gi,
    startPositionId: t.startPositionId,
    endPositionId: t.endPositionId,
    keyPoints: t.keyPoints,
    commonMistakes: t.commonMistakes,
    tagIds: t.tagIds,
    steps: t.steps,
    chains: t.chains,
  };
}

/** Bone-length warnings of the current step against the standard body (ADR 0002 addendum). */
export function currentWarnings(state: EditorState): StandardBodyWarning[] {
  const current = state.technique.steps[state.stepIndex];
  return current ? standardBodyWarnings(current.pose) : [];
}

export const currentPublishIssues = (state: EditorState): string[] =>
  publishIssues(state.technique);
