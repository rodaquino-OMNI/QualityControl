/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        target: 'ES2022',
        module: 'commonjs',
        lib: ['ES2022'],
        types: ['jest', 'node'],
        typeRoots: ['node_modules/@types', 'tests'],
        resolveJsonModule: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: false,
        skipLibCheck: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
        paths: {
          '@/*': ['src/*'],
          '@config/*': ['src/config/*'],
          '@controllers/*': ['src/controllers/*'],
          '@middleware/*': ['src/middleware/*'],
          '@models/*': ['src/models/*'],
          '@routes/*': ['src/routes/*'],
          '@services/*': ['src/services/*'],
          '@utils/*': ['src/utils/*']
        }
      }
    }],
  },
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/index-optimized.ts',
    '!src/types/**',
    '!src/**/*.interface.ts',
    '!src/config/**',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageDirectory: '<rootDir>/coverage',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@routes/(.*)$': '<rootDir>/src/routes/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  verbose: true,
  
  // Enhanced reporting for production readiness
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '../test-results',
      outputName: 'backend-junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true,
    }],
  ],
  
  // Performance monitoring
  slowTestThreshold: 5,
  
  // Test execution optimization (sequential for database tests)
  maxWorkers: 1,
  
  // Ensure test isolation
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  resetModules: true,
  
  // Global setup/teardown
  globalSetup: '<rootDir>/tests/jest.env.js',
  globalTeardown: undefined,
  
  // Error handling
  bail: false,
  errorOnDeprecated: false,
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '\\.snap$',
  ],
  
  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],
};