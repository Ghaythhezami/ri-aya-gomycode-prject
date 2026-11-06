/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // Scoped to the modules the suite actually exercises, the way server scopes
  // its own collectCoverageFrom. Bootstrap (main.ts), the Socket.IO adapter and
  // the wiring modules are not counted; their thresholds are not lowered.
  collectCoverageFrom: [
    'auth/**/*.ts',
    'realtime/**/*.ts',
    'relay/**/*.ts',
    'health/**/*.ts',
    '!**/*.module.ts',
    '!**/*.spec.ts',
  ],
  coverageReporters: ['text-summary'],
  coverageThreshold: {
    global: {
      lines: 80,
      statements: 80,
      functions: 70,
      branches: 50,
    },
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@riaya/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  testTimeout: 30_000,
};
