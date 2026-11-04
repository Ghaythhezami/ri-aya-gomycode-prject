/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'auth/**/*.ts',
    'cache/**/*.ts',
    'common/validators/**/*.ts',
    '!auth/**/*.spec.ts',
    '!cache/**/*.spec.ts',
    '!auth/dto/**',
    '!auth/entities/**',
  ],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: {
      lines: 80,
      statements: 80,
      functions: 70,
      branches: 50,
    },
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test-setup.ts'],
  testTimeout: 30_000,
  // Hooks boot the real AppModule against a live database, which on a loaded
  // machine exceeds the 30s test budget; the specs assert on the outcome of the
  // boot, not on its speed.
  hookTimeout: 90_000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
