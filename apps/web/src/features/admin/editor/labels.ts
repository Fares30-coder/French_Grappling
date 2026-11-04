import type {
  CurrentJoint,
  FighterId,
  StandardBodyWarning,
  StandardBoneKey,
} from '@tatamap/shared';

export const FIGHTER_LABELS_FR: Record<FighterId, string> = {
  me: 'Toi',
  opponent: 'Adversaire',
};

export const JOINT_LABELS_FR: Record<CurrentJoint, string> = {
  head: 'Tête',
  nose: 'Nez',
  neck: 'Cou',
  chest: 'Poitrine',
  pelvis: 'Bassin',
  shoulderL: 'Épaule gauche',
  shoulderR: 'Épaule droite',
  elbowL: 'Coude gauche',
  elbowR: 'Coude droit',
  handL: 'Main gauche',
  handR: 'Main droite',
  handTipL: 'Doigts gauches',
  handTipR: 'Doigts droits',
  hipL: 'Hanche gauche',
  hipR: 'Hanche droite',
  kneeL: 'Genou gauche',
  kneeR: 'Genou droit',
  footL: 'Cheville gauche',
  footR: 'Cheville droite',
  toeL: 'Pointe du pied gauche',
  toeR: 'Pointe du pied droit',
};

/** The joint buttons of the editor, by part of the body (each joint once). */
export const JOINT_GROUPS_FR: ReadonlyArray<readonly [string, ReadonlyArray<CurrentJoint>]> = [
  ['Tête et buste', ['head', 'nose', 'neck', 'chest', 'pelvis']],
  ['Bras gauche', ['shoulderL', 'elbowL', 'handL', 'handTipL']],
  ['Bras droit', ['shoulderR', 'elbowR', 'handR', 'handTipR']],
  ['Jambe gauche', ['hipL', 'kneeL', 'footL', 'toeL']],
  ['Jambe droite', ['hipR', 'kneeR', 'footR', 'toeR']],
];

/** Bone names for the length warnings (the bones of the standard body). */
export const BONE_LABELS_FR: Readonly<Record<StandardBoneKey, string>> = {
  'neck-head': 'cou',
  'pelvis-chest': 'bas du buste',
  'chest-neck': 'haut du buste',
  'shoulderL-elbowL': 'bras gauche',
  'shoulderR-elbowR': 'bras droit',
  'elbowL-handL': 'avant-bras gauche',
  'elbowR-handR': 'avant-bras droit',
  'handL-handTipL': 'main gauche',
  'handR-handTipR': 'main droite',
  'pelvis-hipL': 'hanche gauche',
  'pelvis-hipR': 'hanche droite',
  'hipL-kneeL': 'cuisse gauche',
  'hipR-kneeR': 'cuisse droite',
  'kneeL-footL': 'tibia gauche',
  'kneeR-footR': 'tibia droit',
  'footL-toeL': 'pied gauche',
  'footR-toeR': 'pied droit',
};

/** French name of a bone. */
export const boneLabel = (bone: StandardBoneKey): string => BONE_LABELS_FR[bone];

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "Avant-bras gauche de toi : 42 cm (réf. 31 cm)". */
export function formatWarning(w: StandardBodyWarning): string {
  const owner = w.fighter === 'me' ? 'toi' : "l'adversaire";
  return `${capitalize(boneLabel(w.bone))} de ${owner} : ${Math.round(w.lengthCm)} cm (réf. ${Math.round(w.referenceCm)} cm)`;
}
