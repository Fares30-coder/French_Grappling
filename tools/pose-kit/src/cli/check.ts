import { loadTechnique, resolveTechniqueFile } from '../load';
import { countIssues, formatReport, reportTechnique } from '../report';

const USAGE = `Usage: pnpm pose:check <slug|path.json> [--strict]

Checks one technique of CONTENT_DIR (default content/): schema (blocking), bone lengths against
step 1 (same 15 % rule as the editor), joints under the mat, rough overlap between fighters.
Overlap detection is an APPROXIMATE heuristic on the bare skeleton: treat it as a hint.
Exit code 1 on an invalid file, or on any warning with --strict.`;

const args = process.argv.slice(2);
const strict = args.includes('--strict');
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

const reports = reportTechnique(loaded.technique);
console.log(formatReport(loaded.technique, reports));
const issues = countIssues(reports);
console.log(issues === 0 ? '\nNo warning.' : `\n${issues} warning(s) (not blocking).`);
process.exit(strict && issues > 0 ? 1 : 0);
