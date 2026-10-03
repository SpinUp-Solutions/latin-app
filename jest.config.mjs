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

// Test the React Compiler output that `next build` ships, not the uncompiled source.
const withReactCompiler = async () => {
  const config = await createJestConfig(customJestConfig)();
  const transform = Object.fromEntries(
    Object.entries(config.transform).map(([pattern, [transformer, options]]) => [
      pattern,
      transformer.endsWith('jest-transformer.js')
        ? ['<rootDir>/tests/helpers/reactCompilerJestTransformer.cjs', options]
        : [transformer, options],
    ])
  );
  return { ...config, transform };
};

export default withReactCompiler;
