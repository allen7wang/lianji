import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectKey = createHash('sha256').update(projectRoot).digest('hex').slice(0, 12);
const previewRoot = join(homedir(), 'Library', 'Application Support', 'Lianji', 'SimulatorPreview', projectKey);
await mkdir(previewRoot, { recursive: true, mode: 0o700 });

const lockfile = await readFile(join(projectRoot, 'package-lock.json'));
const lockHash = createHash('sha256').update(lockfile).digest('hex');
const installMarker = join(previewRoot, 'node_modules', '.lianji-preview-lock');
const installedLockHash = await readFile(installMarker, 'utf8').catch(() => null);
// Mirror routes so a deleted screen cannot survive in a later build.
await rm(join(previewRoot, 'src'), { recursive: true, force: true });
// Keep build sources out of iCloud and temporary-directory cleanup.
for (const name of ['package.json', 'package-lock.json', 'app.json', 'tsconfig.json', 'eslint.config.js', 'src', 'assets', 'scripts', 'plugins']) {
  await cp(join(projectRoot, name), join(previewRoot, name), { recursive: true, force: true });
}
const installed = await access(join(previewRoot, 'node_modules', 'expo', 'package.json')).then(() => true, () => false);
if (!installed || installedLockHash !== lockHash) {
  run('npm', ['ci', '--no-audit', '--no-fund']);
  await writeFile(installMarker, lockHash);
}

// Expo owns the generated native project; synchronize configuration and plugins.
run('npx', ['expo', 'prebuild', '--platform', 'ios', '--no-install', '--no-clean']);
// Embed JavaScript and assets in the existing app identity, without a preview server.
const deviceArguments = process.env.LIANJI_SIMULATOR_UDID
  ? ['--device', process.env.LIANJI_SIMULATOR_UDID]
  : [];
run('npx', ['expo', 'run:ios', '--configuration', 'Release', '--no-bundler', ...deviceArguments]);

function run(command, args, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    cwd: previewRoot,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnvironment },
  });
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0) process.exit(result.status ?? 1);
}
