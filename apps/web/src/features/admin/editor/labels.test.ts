import { CURRENT_JOINTS, STANDARD_BODY_V2_21 } from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import {
  BONE_LABELS_FR,
  FIGHTER_LABELS_FR,
  formatWarning,
  JOINT_GROUPS_FR,
  JOINT_LABELS_FR,
} from './labels';

describe('labels', () => {
  it('name each bone of the standard body, once', () => {
    expect(Object.keys(BONE_LABELS_FR).sort()).toEqual(Object.keys(STANDARD_BODY_V2_21).sort());
    const labels = Object.values(BONE_LABELS_FR);
    expect(new Set(labels).size).toBe(labels.length);
    expect(BONE_LABELS_FR['kneeR-footR']).toBe('tibia droit');
  });

  it('name the 21 joints and both fighters', () => {
    expect(Object.keys(JOINT_LABELS_FR).sort()).toEqual([...CURRENT_JOINTS].sort());
    expect(new Set(Object.values(JOINT_LABELS_FR)).size).toBe(21);
    expect(FIGHTER_LABELS_FR).toEqual({ me: 'Toi', opponent: 'Adversaire' });
  });

  it('group every joint once in the editor panel', () => {
    const grouped = JOINT_GROUPS_FR.flatMap(([, joints]) => joints);
    expect([...grouped].sort()).toEqual([...CURRENT_JOINTS].sort());
  });

  it('formats a warning', () => {
    expect(
      formatWarning({ fighter: 'me', bone: 'elbowL-handL', lengthCm: 41.6, referenceCm: 31.2 }),
    ).toBe('Avant-bras gauche de toi : 42 cm (réf. 31 cm)');
    expect(
      formatWarning({ fighter: 'opponent', bone: 'hipR-kneeR', lengthCm: 60, referenceCm: 45 }),
    ).toBe("Cuisse droite de l'adversaire : 60 cm (réf. 45 cm)");
  });
});
