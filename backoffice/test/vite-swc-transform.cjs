/**
 * Jest transformer: @swc/jest plus a shim for the Vite-only `import.meta` APIs.
 *
 * Jest runs CommonJS, where `import.meta` is a syntax error. The source uses two
 * Vite features, rewritten here before SWC sees the file:
 *   - `import.meta.env`  -> an object with Vite's defaults plus the VITE_* variables
 *   - `import.meta.glob` -> eager `require`s of the matched files (only the
 *     `{ eager: true, import: 'default' }` form used by src/i18n is supported)
 */
const fs = require('node:fs');
const path = require('node:path');
const { createTransformer } = require('@swc/jest');

const swc = createTransformer({
  jsc: {
    target: 'es2022',
    parser: { syntax: 'typescript', tsx: true },
    transform: { react: { runtime: 'automatic' } },
  },
});

const ENV =
  'Object.assign({ BASE_URL: "/", MODE: "test", DEV: false, PROD: false, SSR: false }, ' +
  'Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("VITE_"))))';

function globFiles(dir, pattern) {
  const segments = pattern.replace(/^\.\//, '').split('/');
  let dirs = [dir];
  segments.slice(0, -1).forEach((segment) => {
    dirs = dirs.flatMap((d) =>
      fs.existsSync(d)
        ? fs
            .readdirSync(d, { withFileTypes: true })
            .filter((e) => e.isDirectory() && (segment === '*' || e.name === segment))
            .map((e) => path.join(d, e.name))
        : [],
    );
  });
  const last = new RegExp(`^${segments.at(-1).replace(/[.]/g, '\.').replace(/\*/g, '[^/]*')}$`);
  return dirs.flatMap((d) =>
    fs
      .readdirSync(d)
      .filter((name) => last.test(name))
      .map((name) => ({ file: path.join(d, name), rel: path.relative(dir, path.join(d, name)) })),
  );
}

function rewrite(source, filename) {
  if (!source.includes('import.meta')) return source;
  let out = source.replace(
    /import\.meta\.glob(?:<[^>]*>)?\(\s*'([^']+)'[\s\S]*?\)\s*;/g,
    (_m, pattern) => {
      const entries = globFiles(path.dirname(filename), pattern).map(
        ({ file, rel }) =>
          `${JSON.stringify('./' + rel.split(path.sep).join('/'))}: require(${JSON.stringify(file)})`,
      );
      return `({ ${entries.join(', ')} });`;
    },
  );
  out = out.replace(/import\.meta\.env/g, `(${ENV})`);
  return out;
}

module.exports = {
  ...swc,
  process(source, filename, options) {
    return swc.process(rewrite(source, filename), filename, options);
  },
  getCacheKey(source, filename, options) {
    return swc.getCacheKey(rewrite(source, filename), filename, options);
  },
};
