#!/usr/bin/env node
/**
 * Copies the built backoffice (backoffice/dist, built with VITE_BASE=/app/) into
 * web/public/app so the marketing site serves the workspace at /app on one origin.
 * Used by the Vercel build of the `web` project (web/vercel.json).
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'backoffice', 'dist');
const target = join(root, 'web', 'public', 'app');

if (!existsSync(join(source, 'index.html'))) {
  console.error('✖ backoffice/dist/index.html not found — build the backoffice first.');
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`✓ Copied backoffice build to ${target}`);
