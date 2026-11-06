/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.test.{ts,tsx}'],
  setupFiles: ['<rootDir>/test/polyfills.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  transform: {
    '^.+\.(t|j)sx?$': '<rootDir>/test/vite-swc-transform.cjs',
  },
  moduleNameMapper: {
    '\.(css|less|scss)$': 'identity-obj-proxy',
    '\.(png|jpe?g|gif|svg|webp|ico)$': '<rootDir>/test/file-stub.cjs',
    // Tests read the shared contract from source, never a stale dist/ build.
    '^@riaya/shared$': '<rootDir>/../packages/shared/src/index.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // The guard-script tests spawn a Node process per probe, so their cost is
  // dominated by process startup. The 5s default is close enough to that
  // cost that a loaded machine pushes them over; a hung child still fails.
  testTimeout: 30_000,
};
