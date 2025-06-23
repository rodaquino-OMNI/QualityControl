/**
 * Backend Test Configuration
 * Jest configuration with base config inheritance
 */

const baseConfig = require('./base.config');

const backendConfig = {
  ...baseConfig,
  
  // Backend-specific settings
  environment: {
    ...baseConfig.environment,
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    parallel: false, // Database tests need sequential execution
  },
  
  // Backend-specific module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@routes/(.*)$': '<rootDir>/src/routes/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@validators/(.*)$': '<rootDir>/src/validators/$1',
  },
  
  // Backend-specific coverage settings
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/index-optimized.ts',
    '!src/types/**',
    '!src/**/*.interface.ts',
    '!src/config/**',
    '!src/**/*.config.ts',
    '!src/prisma/**',
  ],
  
  // Backend-specific test patterns
  testMatch: [
    '<rootDir>/tests/**/__tests__/**/*.+(ts|tsx|js)',
    '<rootDir>/tests/**/?(*.)+(spec|test).+(ts|tsx|js)',
    '<rootDir>/src/**/__tests__/**/*.+(ts|tsx|js)',
    '<rootDir>/src/**/?(*.)+(spec|test).+(ts|tsx|js)',
  ],
  
  // Backend-specific transformations
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        types: ['jest', 'node'],
        typeRoots: ['node_modules/@types', 'tests'],
        resolveJsonModule: true,
        esModuleInterop: true,
      },
    }],
  },
  
  // Backend performance thresholds
  performance: {
    ...baseConfig.performance,
    thresholds: {
      ...baseConfig.performance.thresholds,
      databaseQuery: 500, // ms per database query
      apiResponse: 1000, // ms per API response
      middlewareExecution: 100, // ms per middleware
    },
  },
  
  // Backend-specific environment variables
  setupFiles: ['<rootDir>/tests/env.setup.ts'],
  
  // Backend-specific globals
  globals: {
    'process.env.NODE_ENV': 'test',
    'process.env.JWT_SECRET': 'test-jwt-secret',
    'process.env.DATABASE_URL': 'postgresql://test:test@localhost:5432/austa_test',
  },
  
  // Backend test isolation
  isolation: {
    database: true,
    redis: true,
    filesystem: true,
    network: true,
  },
  
  // Backend-specific reporters
  reporters: {
    ...baseConfig.reporters,
    database: true,
    api: true,
    performance: true,
  },
};

module.exports = backendConfig;