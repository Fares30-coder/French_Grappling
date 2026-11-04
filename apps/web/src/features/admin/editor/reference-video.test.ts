import { describe, expect, it } from 'vitest';
import { formatTime, loadMarks, setMark, stepFrames } from './reference-video';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
};

describe('reference video marks', () => {
  it('keeps a moment per step and technique, across reloads', () => {
    const storage = memory();
    let marks = loadMarks('t1', storage);
    expect(marks).toEqual({});
    marks = setMark('t1', marks, 2, 3.4567, storage);
    marks = setMark('t1', marks, 0, 0.5, storage);
    expect(loadMarks('t1', storage)).toEqual({ 0: 0.5, 2: 3.457 });
    expect(loadMarks('t2', storage)).toEqual({});
    marks = setMark('t1', marks, 2, null, storage);
    expect(loadMarks('t1', storage)).toEqual({ 0: 0.5 });
  });

  it('ignores corrupt or missing storage', () => {
    const storage = memory();
    storage.setItem('tatamap.editor.reference.t1', '{not json');
    expect(loadMarks('t1', storage)).toEqual({});
    storage.setItem('tatamap.editor.reference.t1', JSON.stringify({ a: 1, '3': 'x', '4': -2 }));
    expect(loadMarks('t1', storage)).toEqual({ 4: 0 });
    expect(loadMarks('t1', undefined)).toEqual({});
  });
});

describe('frame stepping and readout', () => {
  it('moves by frames within the video', () => {
    expect(stepFrames(1, 3, 10)).toBeCloseTo(1.1);
    expect(stepFrames(0.02, -3, 10)).toBe(0);
    expect(stepFrames(9.99, 3, 10)).toBe(10);
  });

  it('formats minutes, seconds and hundredths', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(65.5)).toBe('1:05.50');
  });
});
