import { readFileSync, writeFileSync } from 'node:fs';
import { FIGHTERS } from '@tatamap/shared';
import { fixPoseThighs, THIGH_TOLERANCE } from '../legs';
import { listTechniqueFiles, loadTechnique, resolveTechniqueFile } from '../load';

const USAGE = `Usage: pnpm pose:legs <slug|path.json|--all> [--write]

Brings back to the standard length (STANDARD_BODY_V2_21) every thigh, hip joint -> knee, that is
off by more than ${THIGH_TOLERANCE * 100} %: the knee is placed again by IK from the hip joint to the ankle, bending
the way it bent; the ankle stays where it is unless the straight leg cannot reach it. Prints what
moves. Dry run unless --write, which rewrites the knees, ankles and toes in the file(s): run
pose:check and look at the moved steps in the editor afterwards, then content:import.`;

const args = process.argv.slice(2);
const write = args.includes('--write');
const all = args.includes('--all');
const target = args.find((a) => !a.startsWith('--'));
if ((!target && !all) || args.includes('--help')) {
  console.log(USAGE);
  process.exit(target || all ? 0 : 2);
}

let files: string[];
try {
  files = all ? listTechniqueFiles() : [resolveTechniqueFile(target as string)];
} catch (error) {
  console.error((error as Error).message);
  process.exit(2);
}

let total = 0;
for (const file of files) {
  const loaded = loadTechnique(file);
  if (!loaded.ok) {
    console.error(`INVALID  ${loaded.file}`);
    for (const e of loaded.errors) console.error(`  ${e}`);
    process.exitCode = 1;
    continue;
  }
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    steps: Array<{ pose: { skeleton: string; fighters: Record<string, Record<string, unknown>> } }>;
  };
  let count = 0;
  const lines: string[] = [];
  for (const [i, step] of loaded.technique.steps.entries()) {
    const { pose, fixes } = fixPoseThighs(step.pose);
    if (!fixes.length) continue;
    const out = raw.steps[i]?.pose;
    if (out) {
      out.skeleton = pose.skeleton;
      for (const f of FIGHTERS) out.fighters[f] = { ...pose.fighters[f] };
    }
    for (const x of fixes) {
      count++;
      lines.push(
        `  step ${i + 1}  ${x.fighter} thigh${x.side} ${x.thighBefore.toFixed(1)} cm: knee moved ${x.kneeMovedCm.toFixed(1)} cm` +
          (x.footMovedCm > 0.05 ? `, ankle ${x.footMovedCm.toFixed(1)} cm (out of reach)` : ''),
      );
    }
  }
  total += count;
  console.log(`${loaded.technique.slug}: ${count} thigh(s)${count ? '' : ' OK'}`);
  for (const line of lines) console.log(line);
  if (write && count) writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
}
console.log(`${total} thigh(s) ${write ? 'fixed' : 'to fix (dry run, --write to apply)'}`);
