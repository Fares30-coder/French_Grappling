/**
 * Reference video in the pose editor: which moment of the video goes with which step, kept in
 * the browser (localStorage) per technique. The video itself never leaves the browser: it is a
 * local file the admin picks, shown next to or over the 3D view to place the joints on it.
 *
 * Steps are matched by index: inserting or moving a step shifts the marks after it.
 */

export type StepMarks = Record<number, number>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const key = (techniqueId: string) => `tatamap.editor.reference.${techniqueId}`;

export function loadMarks(techniqueId: string, storage: StorageLike | undefined): StepMarks {
  if (!storage) return {};
  try {
    const raw = JSON.parse(storage.getItem(key(techniqueId)) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object') return {};
    const out: StepMarks = {};
    for (const [index, time] of Object.entries(raw as Record<string, unknown>)) {
      const i = Number(index);
      if (Number.isInteger(i) && i >= 0 && typeof time === 'number' && Number.isFinite(time)) {
        out[i] = Math.max(0, time);
      }
    }
    return out;
  } catch {
    return {}; // unreadable or corrupt: start afresh
  }
}

/** The marks with step `index` set to `time` (s), or cleared when `time` is null; saved. */
export function setMark(
  techniqueId: string,
  marks: StepMarks,
  index: number,
  time: number | null,
  storage: StorageLike | undefined,
): StepMarks {
  const next = { ...marks };
  if (time === null) delete next[index];
  else next[index] = Math.max(0, Math.round(time * 1000) / 1000);
  try {
    storage?.setItem(key(techniqueId), JSON.stringify(next));
  } catch {
    // Storage full or blocked: the marks still work for this session.
  }
  return next;
}

/** Video time `frames` frames away from `time`, within [0, duration]. */
export function stepFrames(time: number, frames: number, duration: number, fps = 30): number {
  const target = time + frames / fps;
  return Math.min(Math.max(0, target), Number.isFinite(duration) ? duration : target);
}

/** m:ss.cc, for the time readout. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}
