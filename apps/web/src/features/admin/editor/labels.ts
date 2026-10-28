import type { BoneKey, FighterId, JointV1_11, PoseWarning } from '@tatamap/shared';

export const FIGHTER_LABELS_FR: Record<FighterId, string> = {
  me: 'Toi',
  opponent: 'Adversaire',
};

export const JOINT_LABELS_FR: Record<JointV1_11, string> = {
  head: 'Tête',
  neck: 'Cou',
  hip: 'Hanche',
  elbowL: 'Coude gauche',
  handL: 'Main gauche',
  elbowR: 'Coude droit',
  handR: 'Main droite',
  kneeL: 'Genou gauche',
  footL: 'Pied gauche',
  kneeR: 'Genou droit',
  footR: 'Pied droit',
};

/** Bone names for the length warnings (the 9 bones of BONES_V1_11). */
export const BONE_LABELS_FR: Readonly<Record<string, string>> = {
  'neck-hip': 'buste',
  'neck-elbowL': 'bras gauche',
  'elbowL-handL': 'avant-bras gauche',
  'neck-elbowR': 'bras droit',
  'elbowR-handR': 'avant-bras droit',
  'hip-kneeL': 'cuisse gauche',
  'kneeL-footL': 'tibia gauche',
  'hip-kneeR': 'cuisse droite',
  'kneeR-footR': 'tibia droit',
};

/** French name of a bone; falls back on the key itself (cannot happen for the 9 real bones). */
export const boneLabel = (bone: BoneKey): string => BONE_LABELS_FR[bone] ?? bone;

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "Avant-bras gauche de toi : 42 cm (réf. 31 cm)". */
export function formatWarning(w: PoseWarning): string {
  const owner = w.fighter === 'me' ? 'toi' : "l'adversaire";
  return `${capitalize(boneLabel(w.bone))} de ${owner} : ${Math.round(w.lengthCm)} cm (réf. ${Math.round(w.referenceCm)} cm)`;
}
