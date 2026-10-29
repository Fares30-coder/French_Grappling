import {
  type ContentTechnique,
  handednessScore,
  mirroredFighters,
  standardBodyWarnings,
} from '@tatamap/shared';
import { findContacts, jointsBelowMat } from './analyze';

export type StepReport = {
  index: number;
  title: string;
  boneWarnings: string[];
  mirrored: string[];
  underMat: string[];
  contacts: string[];
};

const cm = (n: number) => `${n.toFixed(1)} cm`;

/** Pure: everything `pose:check` prints, per step. Bone lengths are checked against the standard body. */
export function reportTechnique(technique: ContentTechnique): StepReport[] {
  return technique.steps.map((step, i) => ({
    index: i + 1,
    title: step.title,
    boneWarnings: standardBodyWarnings(step.pose).map(
      (w) =>
        `${w.fighter} ${w.bone}: ${cm(w.lengthCm)} (standard: ${cm(w.referenceCm)}, ${
          w.lengthCm > w.referenceCm ? '+' : '-'
        }${Math.round((Math.abs(w.lengthCm - w.referenceCm) / w.referenceCm) * 100)} %)`,
    ),
    mirrored: mirroredFighters(step.pose).map(
      (f) =>
        `${f}: L joints on the body's right (score ${handednessScore(step.pose.fighters[f])?.toFixed(0)} cm), swap the L/R names`,
    ),
    underMat: jointsBelowMat(step.pose).map(
      (j) =>
        `${j.fighter} ${j.joint}: y=${j.y.toFixed(1)}, ${
          j.y < 0
            ? 'under the mat'
            : `sinks into the mat (partly hidden, keep >= ${j.joint === 'head' ? 14 : 6} cm)`
        }`,
    ),
    contacts: findContacts(step.pose).map(
      (c) => `${c.between}: ${cm(c.distanceCm)} (< ${c.thresholdCm} cm)`,
    ),
  }));
}

export function formatReport(technique: ContentTechnique, reports: StepReport[]): string {
  const lines = [`${technique.slug} (${technique.name}), ${reports.length} steps`];
  for (const r of reports) {
    const all = [...r.boneWarnings, ...r.mirrored, ...r.underMat, ...r.contacts];
    lines.push(`step ${r.index}  ${r.title}${all.length === 0 ? '  OK' : ''}`);
    for (const w of r.boneWarnings) lines.push(`  bone length  ${w}`);
    for (const w of r.mirrored) lines.push(`  mirrored     ${w}`);
    for (const w of r.underMat) lines.push(`  mat          ${w}`);
    for (const w of r.contacts) lines.push(`  overlap?     ${w}`);
  }
  return lines.join('\n');
}

export const countIssues = (reports: StepReport[]): number =>
  reports.reduce(
    (n, r) => n + r.boneWarnings.length + r.mirrored.length + r.underMat.length + r.contacts.length,
    0,
  );
