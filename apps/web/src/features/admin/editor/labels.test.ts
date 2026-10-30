import { BONES_V1_11, JOINTS_V1_11 } from '@tatamap/shared';
import { describe, expect, it } from 'vitest';
import { BONE_LABELS_FR, FIGHTER_LABELS_FR, formatWarning, JOINT_LABELS_FR } from './labels';

describe('labels', () => {
  it('name each of the 9 bones, once (plus the neck)', () => {
    expect(BONES_V1_11).toHaveLength(9);
    const labels = BONES_V1_11.map(([a, b]) => BONE_LABELS_FR[`${a}-${b}`]);
    for (const label of labels) expect(label).toBeTruthy();
    expect(new Set(labels).size).toBe(9);
    expect(Object.keys(BONE_LABELS_FR)).toHaveLength(10); // 9 bones + neck-head
    expect(BONE_LABELS_FR['neck-hip']).toBe('buste');
    expect(BONE_LABELS_FR['kneeR-footR']).toBe('tibia droit');
  });

  it('name the 11 joints and both fighters', () => {
    expect(Object.keys(JOINT_LABELS_FR).sort()).toEqual([...JOINTS_V1_11].sort());
    expect(FIGHTER_LABELS_FR).toEqual({ me: 'Toi', opponent: 'Adversaire' });
  });

  it('formats a warning', () => {
    expect(
      formatWarning({ fighter: 'me', bone: 'elbowL-handL', lengthCm: 41.6, referenceCm: 31.2 }),
    ).toBe('Avant-bras gauche de toi : 42 cm (réf. 31 cm)');
    expect(
      formatWarning({ fighter: 'opponent', bone: 'hip-kneeR', lengthCm: 60, referenceCm: 45 }),
    ).toBe("Cuisse droite de l'adversaire : 60 cm (réf. 45 cm)");
  });
});
