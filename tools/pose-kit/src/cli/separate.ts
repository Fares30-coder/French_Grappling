import { readFileSync, writeFileSync } from 'node:fs';
import { CURRENT_JOINTS, FIGHTERS } from '@tatamap/shared';
import { loadTechnique, resolveTechniqueFile } from '../load';
import { MAX_MOVE_CM, separateTechnique } from '../separate';
import { distance } from '../vec';
import { maxPenetration, PENETRATION_TOLERANCE_CM, transitionPenetration } from '../volume';

const USAGE = `Usage: pnpm pose:separate <slug|path.json> [--write] [--steps-only]

Pushes apart the body parts that sink more than ${PENETRATION_TOLERANCE_CM} cm into each other (the mannequin's
volume, as in pose:check), at the steps and inside the transitions, keeping bone lengths and the
mat. Prints, per step, the depth before and after and how far the most moved joint went. Dry run
unless --write, which rewrites the file: check the moved steps in the editor afterwards, then
content:import. --steps-only leaves the transitions alone, for steps that are not a sequence
(poses-de-reference). No joint moves more than ${MAX_MOVE_CM} cm.`;

const args = process.argv.slice(2);
const write = args.includes('--write');
const stepsOnly = args.includes('--steps-only');
const target = args.find((a) => !a.startsWith('--'));
if (!target || args.includes('--help')) {
  console.log(USAGE);
  process.exit(target ? 0 : 2);
}

let file: string;
try {
  file = resolveTechniqueFile(target);
} catch (error) {
  console.error((error as Error).message);
  process.exit(2);
}
const loaded = loadTechnique(file);
if (!loaded.ok) {
  console.error(`INVALID  ${loaded.file}`);
  for (const e of loaded.errors) console.error(`  ${e}`);
  process.exit(1);
}

const before = loaded.technique.steps.map((s) => s.pose);
const after = separateTechnique(before, { transitions: !stepsOnly });
const depth = (poses: typeof before, i: number) => {
  const pose = poses[i];
  const next = poses[i + 1];
  if (!pose) return '';
  const inside = next && !stepsOnly ? (transitionPenetration(pose, next)?.depthCm ?? 0) : null;
  return `${maxPenetration(pose).toFixed(1)} cm${inside === null ? '' : ` (to next ${inside.toFixed(1)})`}`;
};

// The raw JSON is edited in place (only the poses' skeleton and joints), so key order and the
// other fields stay. A pose of an older skeleton is written back upgraded.
const raw = JSON.parse(readFileSync(file, 'utf8')) as {
  steps: Array<{ pose: { skeleton: string; fighters: Record<string, Record<string, unknown>> } }>;
};
let changed = 0;
for (const [i, step] of loaded.technique.steps.entries()) {
  const pose = after[i];
  if (!pose) continue;
  let moved = 0;
  const out = raw.steps[i]?.pose;
  if (out) out.skeleton = pose.skeleton;
  for (const f of FIGHTERS) {
    for (const j of CURRENT_JOINTS) {
      moved = Math.max(moved, distance(pose.fighters[f][j], step.pose.fighters[f][j]));
    }
    if (out) out.fighters[f] = { ...pose.fighters[f] };
  }
  if (moved > 0) changed++;
  console.log(
    `step ${i + 1}  ${step.title}: ${depth(before, i)} -> ${depth(after, i)}, ` +
      `most moved joint ${moved.toFixed(1)} cm`,
  );
}
if (changed === 0) console.log('\nNothing sinks in: no change.');
else if (write) {
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
  console.log(`\n${changed} step(s) rewritten in ${file}.`);
} else console.log(`\n${changed} step(s) would change. Dry run: add --write to save.`);
