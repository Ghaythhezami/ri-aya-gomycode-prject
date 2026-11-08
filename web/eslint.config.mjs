import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const baseDirectory = dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({ baseDirectory });

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // Pin the TypeScript root to THIS package so the VS Code ESLint extension
    // does not infer multiple tsconfig roots in this pnpm monorepo.
    languageOptions: {
      parserOptions: { tsconfigRootDir: baseDirectory },
    },
  },
];
