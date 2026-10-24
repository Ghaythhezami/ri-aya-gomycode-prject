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
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
