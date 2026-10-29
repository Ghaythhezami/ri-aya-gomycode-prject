import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * Component tests for the backoffice.
 *
 * A separate config from `vite.config.ts` keeps the build untouched while giving
 * tests a DOM environment and the jest-dom matchers.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.{ts,tsx}'],
    },
  }),
);
