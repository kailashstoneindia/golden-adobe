// Builds dist/function.zip, ready for `aws lambda update-function-code`:
//
//   pnpm --filter @golden-abode/media-lambda package
//
// The Lambda runs on linux/arm64 (Graviton, cheaper than x86), but this is often
// run on a developer's Windows or Mac machine. sharp ships a prebuilt binary per
// platform, so installing it here would pick the WRONG one. It is installed with
// explicit --os/--cpu/--libc instead, and the result is checked before zipping,
// because a function with the wrong binary only fails once it is live.
import { spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { ZipArchive } from 'archiver';

import { bundle } from './bundle.mjs';

const OUT_DIR = 'dist/lambda';
const ZIP_PATH = 'dist/function.zip';
// Lambda accepts a zip up to 50 MB through a direct upload.
const MAX_ZIP_BYTES = 50 * 1024 * 1024;

const sharpVersion = JSON.parse(readFileSync('package.json', 'utf8')).dependencies.sharp;
if (!/^\d+\.\d+\.\d+$/.test(sharpVersion)) {
  throw new Error(`sharp must be pinned to an exact version, found "${sharpVersion}"`);
}

rmSync('dist', { recursive: true, force: true });
await bundle();

writeFileSync(
  join(OUT_DIR, 'package.json'),
  JSON.stringify({
    name: 'golden-abode-media-variants',
    private: true,
    dependencies: { sharp: sharpVersion },
  }),
);

const npm = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  [
    'install',
    '--omit=dev',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--os=linux',
    '--cpu=arm64',
    '--libc=glibc',
  ],
  { cwd: OUT_DIR, stdio: 'inherit', shell: process.platform === 'win32' },
);
if (npm.status !== 0) throw new Error('npm install for linux/arm64 failed');

for (const required of ['@img/sharp-linux-arm64', '@img/sharp-libvips-linux-arm64']) {
  if (!existsSync(join(OUT_DIR, 'node_modules', required))) {
    throw new Error(`${required} is missing: the zip would not run on Lambda (linux/arm64)`);
  }
}
for (const wrong of ['@img/sharp-win32-x64', '@img/sharp-darwin-arm64', '@img/sharp-linux-x64']) {
  if (existsSync(join(OUT_DIR, 'node_modules', wrong))) {
    throw new Error(`${wrong} was installed: wrong platform binary in the zip`);
  }
}

await new Promise((resolve, reject) => {
  const output = createWriteStream(ZIP_PATH);
  const zip = new ZipArchive({ zlib: { level: 9 } });
  output.on('close', resolve);
  zip.on('error', reject);
  zip.pipe(output);
  zip.directory(OUT_DIR, false);
  zip.finalize();
});

const bytes = statSync(ZIP_PATH).size;
if (bytes > MAX_ZIP_BYTES) {
  throw new Error(
    `function.zip is ${bytes} bytes, over the ${MAX_ZIP_BYTES} byte direct-upload limit`,
  );
}
console.log(
  `built ${ZIP_PATH}: ${(bytes / 1024 / 1024).toFixed(1)} MB, sharp ${sharpVersion} (linux/arm64)`,
);
