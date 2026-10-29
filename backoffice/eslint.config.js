import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pin the TypeScript root to THIS package.
 *
 * Without it, @typescript-eslint falls back to `process.cwd()`. The VS Code
 * ESLint extension lints with the workspace root as cwd, where backoffice/,
 * server/ and web/ are all candidates, and it refuses to parse:
 *   "No tsconfigRootDir was set, and multiple candidate TSConfigRootDirs are present"
 * Setting it makes linting independent of the directory ESLint is launched from.
 */
const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  files: ['src/**/*.{ts,tsx}'],
  languageOptions: {
    globals: globals.browser,
    parserOptions: { tsconfigRootDir },
  },
  plugins: { 'react-hooks': reactHooks },
  rules: {
    ...reactHooks.configs.recommended.rules,
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
});
