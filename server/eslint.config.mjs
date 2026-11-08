import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pin the TypeScript root to THIS package.
 *
 * Without it, @typescript-eslint can fall back to the workspace root, where
 * server/, web/ and backoffice/ are all candidate tsconfig roots, and parsing
 * fails with:
 *   "No tsconfigRootDir was set, and multiple candidate TSConfigRootDirs are present"
 * Setting it makes linting independent of the directory ESLint is launched
 * from (the VS Code ESLint extension uses "auto" working directories).
 */
const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { tsconfigRootDir },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
