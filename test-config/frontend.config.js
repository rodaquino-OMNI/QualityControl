/**
 * Frontend Test Configuration
 * Vitest configuration with base config inheritance
 */

const baseConfig = require('./base.config');
const path = require('path');

const frontendConfig = {
  ...baseConfig,
  
  // Frontend-specific settings
  environment: {
    ...baseConfig.environment,
    testEnvironment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    parallel: true, // Frontend tests can run in parallel
  },
  
  // Frontend-specific module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/src/test/__mocks__/fileMock.js',
  },
  
  // Frontend-specific coverage settings
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/vite-env.d.ts',
    '!src/test/**',
    '!src/**/*.stories.tsx',
    '!src/**/__tests__/**',
    '!src/**/mockData.ts',
  ],
  
  // Frontend-specific transformations
  transform: {
    '^.+\\.(ts|tsx)$': ['@vitejs/plugin-react', {
      jsx: 'react-jsx',
      typescript: true,
    }],
  },
  
  // Frontend-specific globals and mocks
  globals: {
    // React Testing Library globals
    'process.env.NODE_ENV': 'test',
  },
  
  // Frontend-specific test patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(ts|tsx)',
    '<rootDir>/src/**/*.(test|spec).(ts|tsx)',
  ],
  
  // Frontend performance thresholds
  performance: {
    ...baseConfig.performance,
    thresholds: {
      ...baseConfig.performance.thresholds,
      componentRender: 100, // ms per component render
      hookExecution: 50, // ms per hook execution
    },
  },
  
  // Frontend-specific reporters
  reporters: {
    ...baseConfig.reporters,
    visualRegression: process.env.VISUAL_REGRESSION === 'true',
    accessibility: true,
  },
};

module.exports = frontendConfig;