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
      // The guard-script tests spawn a Node process per probe, so their cost is
      // dominated by process startup. The 5s default is close enough to that
      // cost that a loaded machine pushes them over; a hung child still fails.
      testTimeout: 30_000,
    },
  }),
);
