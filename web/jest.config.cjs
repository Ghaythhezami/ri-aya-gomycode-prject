const nextJest = require('next/jest');

// next/jest wires SWC, the .env files and the Next.js module mocks.
const createJestConfig = nextJest({ dir: './' });

// next-intl and its dependencies ship ESM only; they must go through SWC.
const esmPackages = ['next-intl', 'use-intl', 'intl-messageformat', '@formatjs'];

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

module.exports = async () => {
  const resolved = await createJestConfig(config)();
  return {
    ...resolved,
    transformIgnorePatterns: [
      `/node_modules/(?!(?:\.pnpm/)?(?:${esmPackages.join('|')}))`,
      ...resolved.transformIgnorePatterns.filter((p) => !p.includes('node_modules')),
    ],
  };
};
