import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const GLIMPSE_INSTALL_COMMAND = 'npm install -g glimpseui';
export const GLIMPSE_MISSING_MESSAGE = `glimpseui is not installed. Install it with: ${GLIMPSE_INSTALL_COMMAND}`;

function candidateRoots() {
  const roots = [];
  const envRoot = process.env.GLIMPSEUI_ROOT || process.env.GLIMPSE_ROOT;
  if (envRoot) roots.push(envRoot);

  try {
    const npmRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    if (npmRoot) roots.push(join(npmRoot, 'glimpseui'));
  } catch {}

  roots.push('/opt/homebrew/lib/node_modules/glimpseui');
  roots.push('/usr/local/lib/node_modules/glimpseui');
  roots.push(join(homedir(), '.nvm', 'versions', 'node'));

  return roots;
}

export function findModulePath() {
  for (const root of candidateRoots()) {
    const direct = join(root, 'src', 'glimpse.mjs');
    if (existsSync(direct)) return direct;

    if (root.endsWith('/node')) {
      try {
        const versions = readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort()
          .reverse();
        for (const version of versions) {
          const candidate = join(root, version, 'lib', 'node_modules', 'glimpseui', 'src', 'glimpse.mjs');
          if (existsSync(candidate)) return candidate;
        }
      } catch {}
    }
  }
  return null;
}

export function isGlimpseInstalled() {
  return Boolean(findModulePath());
}

export async function importGlimpse() {
  const modulePath = findModulePath();
  if (!modulePath) {
    throw new Error(GLIMPSE_MISSING_MESSAGE);
  }
  return import(pathToFileURL(modulePath).href);
}
