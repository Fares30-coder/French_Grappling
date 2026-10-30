import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { loadTechnique, REPO_ROOT, resolveTechniqueFile } from '../load';
import { SHEET_CELL, type SheetRow, sheetHtml } from '../render/sheet';
import { RENDER_VIEWS, type RenderView, showRequest } from '../render/views';
import { type DevServer, startViteServer } from '../render/vite-server';

const USAGE = `Usage: pnpm pose:render <slug|path.json> [--out dir] [--steps 1,3] [--views 3d,face] [--server url]

Screenshots of the REAL viewer (headless Chromium, dev-only route /dev/pose-preview), for every
step: 3d (suggested camera), face (x/y plane), profil (z/y plane), dessus (top).
Writes <out>/<slug>/step-<n>-<view>.png and <out>/<slug>/contact-sheet.png (all in one image).
--out     default .pose-renders/ at the repo root (git-ignored)
--server  reuse a running Vite dev server of apps/web (default: start one on a free port, stop it after)
First time only: pnpm --filter @tatamap/pose-kit exec playwright install chromium`;

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const args = process.argv.slice(2);
const flagValues = new Set(['--out', '--steps', '--views', '--server']);
const target = args.find((a, i) => !a.startsWith('--') && !flagValues.has(args[i - 1] ?? ''));
if (!target || args.includes('--help')) {
  console.log(USAGE);
  process.exit(target ? 0 : 2);
}

const loaded = loadTechnique(resolveTechniqueFile(target));
if (!loaded.ok) {
  console.error(`INVALID  ${loaded.file}`);
  for (const e of loaded.errors) console.error(`  ${e}`);
  process.exit(1);
}
const { technique } = loaded;

const outOption = option(args, '--out');
const outBase = outOption
  ? path.resolve(process.env.INIT_CWD ?? process.cwd(), outOption)
  : path.join(REPO_ROOT, '.pose-renders');
const outDir = path.join(outBase, technique.slug);
mkdirSync(outDir, { recursive: true });

const stepsOpt = option(args, '--steps');
const stepIndexes = (
  stepsOpt
    ? stepsOpt.split(',').map((n) => Number.parseInt(n, 10) - 1)
    : technique.steps.map((_, i) => i)
).filter((i) => i >= 0 && i < technique.steps.length);
const viewsOpt = option(args, '--views');
const views = (viewsOpt ? viewsOpt.split(',') : [...RENDER_VIEWS]).filter((v): v is RenderView =>
  (RENDER_VIEWS as readonly string[]).includes(v),
);
if (stepIndexes.length === 0 || views.length === 0) {
  console.error('Nothing to render (check --steps and --views).');
  process.exit(2);
}

// Shape of the globals of the preview page (apps/web/src/features/dev/PosePreviewPage.tsx).
type PreviewWindow = {
  __TATAMAP_PREVIEW__?: unknown;
  __TATAMAP_POSE_PREVIEW__?: { show: (request: unknown) => Promise<void> };
};

async function capture(page: Page, request: ReturnType<typeof showRequest>): Promise<Buffer> {
  // A Vite dependency re-optimisation can reload the page once: wait for the API again and retry.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForFunction(
        () => (window as unknown as PreviewWindow).__TATAMAP_POSE_PREVIEW__ !== undefined,
        null,
        {
          timeout: 30_000,
        },
      );
      await page.evaluate(
        (r) => (window as unknown as PreviewWindow).__TATAMAP_POSE_PREVIEW__?.show(r),
        request,
      );
      return await page.locator('#pose-preview').screenshot({ type: 'png' });
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForLoadState('load');
    }
  }
}

let server: DevServer | null = null;
const stopServer = () => void server?.stop();
process.once('SIGINT', () => {
  stopServer();
  process.exit(130);
});

try {
  const reuseUrl = option(args, '--server');
  if (!reuseUrl) server = await startViteServer();
  const baseUrl = reuseUrl ?? server?.url ?? '';
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 960, height: 600 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
    await page.addInitScript((data) => {
      (window as unknown as PreviewWindow).__TATAMAP_PREVIEW__ = data;
    }, technique);
    await page.goto(`${baseUrl}/dev/pose-preview`, { waitUntil: 'networkidle' });

    const rows: SheetRow[] = [];
    for (const i of stepIndexes) {
      const step = technique.steps[i];
      if (!step) continue;
      const cells: SheetRow['cells'] = [];
      for (const view of views) {
        const png = await capture(page, showRequest(step.pose, i, view));
        const file = path.join(outDir, `step-${i + 1}-${view}.png`);
        writeFileSync(file, png);
        cells.push({ label: view, png });
      }
      rows.push({ title: `${i + 1}. ${step.title}`, cells });
      console.log(`step ${i + 1}: ${views.length} image(s)`);
    }

    const sheetPage = await context.newPage();
    await sheetPage.setViewportSize({ width: SHEET_CELL.width * 4 + 48, height: 600 });
    await sheetPage.setContent(sheetHtml(`${technique.slug} (${technique.name})`, rows));
    const sheetFile = path.join(outDir, 'contact-sheet.png');
    writeFileSync(sheetFile, await sheetPage.screenshot({ type: 'png', fullPage: true }));
    console.log(`\nImages: ${outDir}\nContact sheet: ${sheetFile}`);
  } finally {
    await browser.close();
  }
} finally {
  await server?.stop();
}
