// Bundles the Lambda into dist/lambda/index.js (handler: index.handler).
//
// sharp stays external: it is a native module, installed for the Lambda's own
// platform (linux/arm64) by package.mjs, never bundled. Everything else,
// including the AWS SDK, is bundled so the deployed code does not depend on
// whichever SDK version the Lambda runtime happens to ship.
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

export async function bundle() {
  await build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/lambda/index.js',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['sharp'],
    sourcemap: true,
    logLevel: 'info',
  });
}

// Run directly (`pnpm build`), as opposed to imported by package.mjs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await bundle();
}
