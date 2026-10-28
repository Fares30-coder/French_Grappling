import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { REPO_ROOT } from '../load';

export type DevServer = { url: string; stop: () => Promise<void> };

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('no port'));
      });
    });
  });

async function waitFor(url: string, child: ChildProcess, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`vite exited with code ${child.exitCode}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`vite did not answer on ${url} within ${timeoutMs} ms`);
}

/**
 * Starts the web app's Vite dev server on a dedicated free port (127.0.0.1 only) and stops
 * exactly that process by PID. Never touches another running `pnpm dev`.
 */
export async function startViteServer(port?: number): Promise<DevServer> {
  const chosen = port ?? (await freePort());
  const webDir = path.join(REPO_ROOT, 'apps/web');
  const child = spawn(
    process.execPath,
    [
      path.join(webDir, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(chosen),
      '--strictPort',
    ],
    { cwd: webDir, stdio: 'ignore' },
  );
  const url = `http://127.0.0.1:${chosen}`;
  const stop = async () => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };
  try {
    await waitFor(url, child);
  } catch (error) {
    await stop();
    throw error;
  }
  return { url, stop };
}
