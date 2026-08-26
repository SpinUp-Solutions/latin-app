import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/src/(.*)$': '<rootDir>/src/$1',
    '^@/shared/(.*)$': '<rootDir>/shared/$1',
    '^@sentry/nextjs$': '<rootDir>/tests/helpers/sentryMock.ts',
  },
  testMatch: ['<rootDir>/tests/**/*.test.{js,jsx,ts,tsx}'],
  testEnvironmentOptions: {
    customExportConditions: [''],
  },
  moduleDirectories: ['node_modules', '<rootDir>/'],
};

export default createJestConfig(customJestConfig);
