/**
 * Materialises `@riaya/shared` as runnable CommonJS inside `dist/` (T1.2).
 *
 * The package is consumed as TypeScript source (its `main` is `src/index.ts`),
 * which a bundler handles and `node dist/main.js` does not: Node would load a
 * `.ts` file, and its extensionless relative imports fail under ESM resolution.
 *
 * Compiling it next to the app and placing it at `dist/node_modules/@riaya/shared`
 * means Node's own resolution finds the compiled copy before the workspace
 * symlink, with no runtime hook and no change to the package's published
 * contract. Typechecking still reads the TypeScript source.
 */
const { execFileSync } = require('node:child_process');
const { cpSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const sharedRoot = path.resolve(packageRoot, '..', 'packages', 'shared');
const distRoot = path.join(packageRoot, 'dist');
const staging = path.join(distRoot, '.shared-build');
const target = path.join(distRoot, 'node_modules', '@riaya', 'shared');

const tscEntry = require.resolve('typescript/lib/tsc.js', { paths: [packageRoot] });

rmSync(staging, { recursive: true, force: true });

execFileSync(
  process.execPath,
  [
    tscEntry,
    '-p',
    path.join(sharedRoot, 'tsconfig.json'),
    '--noEmit',
    'false',
    '--outDir',
    staging,
  ],
  { stdio: 'inherit' },
);

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(staging, target, { recursive: true });

writeFileSync(
  path.join(target, 'package.json'),
  `${JSON.stringify(
    { name: '@riaya/shared', version: '0.1.0', private: true, main: 'index.js' },
    null,
    2,
  )}\n`,
);

rmSync(staging, { recursive: true, force: true });
