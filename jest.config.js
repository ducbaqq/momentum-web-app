const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Handle dynamic route imports
    '^@/app/api/fake-trader/runs/\\[runId\\]/route$': '<rootDir>/app/api/fake-trader/runs/[runId]/route',
    '^@/app/api/fake-trader/runs/\\[runId\\]/positions/route$': '<rootDir>/app/api/fake-trader/runs/[runId]/positions/route',
    '^@/app/api/fake-trader/runs/\\[runId\\]/trades/route$': '<rootDir>/app/api/fake-trader/runs/[runId]/trades/route',
  },
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.test.jsx',
  ],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
  ],
  transformIgnorePatterns: [
    '/node_modules/(?!(next)/)',
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);

