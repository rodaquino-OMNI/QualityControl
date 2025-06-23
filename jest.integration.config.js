/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node', // Use node environment for integration tests
  roots: ['<rootDir>/tests/integration', '<rootDir>/backend/tests'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/backend/src/$1',
    '^@backend/(.*)$': '<rootDir>/backend/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    '^bull$': '<rootDir>/tests/mocks/bull.js',
    '^@prisma/client$': '<rootDir>/tests/mocks/prisma.js',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'commonjs',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: false,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          noUnusedLocals: false,
          noUnusedParameters: false,
          resolveJsonModule: true,
          types: ['node', 'jest'],
        },
      },
    ],
  },
  testRegex: '(integration|contracts).*\\.(test|spec)\\.(ts|js)$',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  collectCoverageFrom: [
    'backend/src/**/*.{ts,js}',
    'tests/**/*.{ts,js}',
    '!backend/src/**/*.d.ts',
    '!tests/**/*.d.ts',
    '!tests/mocks/**/*',
    '!tests/fixtures/**/*',
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html', 'json'],

  // Integration test specific configuration
  testTimeout: 30000, // 30 seconds for integration tests

  // Transform ES modules in node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(jose|openid-client|@paralleldrive|msgpackr|bull|uuid|@prisma|bson|mongodb|ioredis)/)',
  ],

  // Parallel execution for faster tests
  maxWorkers: 4,

  // Memory management for large datasets
  maxConcurrency: 4,

  // Clear mocks and restore between tests
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,

  // Verbose output for debugging
  verbose: false,

  // Fail fast on first test failure in CI
  bail: process.env.CI ? 1 : 0,

  // Force exit to prevent hanging processes
  forceExit: true,

  // Detect open handles that prevent Jest from exiting
  detectOpenHandles: true,

  // Enhanced error reporting
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results',
        outputName: 'integration-junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
      },
    ],
  ],

  // Global configuration
  globals: {
    'ts-jest': {
      useESM: false,
      tsconfig: {
        target: 'es2020',
        module: 'commonjs',
      },
    },
  },

  // Module path mapping for absolute imports
  modulePaths: ['<rootDir>'],
};
