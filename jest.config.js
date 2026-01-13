module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: [
    '<rootDir>/src/cli/__tests__',
    '<rootDir>/src/testdata/__tests__',
    '<rootDir>/src/utils/__tests__',
  ],
  testMatch: ['**/*.test.ts'],
  maxWorkers: 1, // Run tests serially to avoid memory issues
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@inquirer)/)',
  ],
  collectCoverageFrom: [
    'src/cli/**/*.ts',
    'src/testdata/**/*.ts',
    'src/utils/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
};
