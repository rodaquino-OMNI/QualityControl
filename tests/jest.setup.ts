/**
 * Jest Setup for Integration Tests
 */

import { AuthTestHelper } from './utils/auth-test-helper';
import { TestDataFactory } from './utils/test-data-factory';

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidId(): R;
      toBeValidEmail(): R;
      toBeValidTimestamp(): R;
    }
  }

  var testUtils: {
    generateToken: (payload: any) => string;
    createTestUser: (overrides?: any) => any;
    hashPassword: (password: string) => Promise<string>;
  };
}

// Custom Jest matchers
expect.extend({
  toBeValidId(received: any) {
    const isValid = typeof received === 'string' && received.length > 0;
    return {
      message: () => `expected ${received} to be a valid ID`,
      pass: isValid
    };
  },

  toBeValidEmail(received: any) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = typeof received === 'string' && emailRegex.test(received);
    return {
      message: () => `expected ${received} to be a valid email`,
      pass: isValid
    };
  },

  toBeValidTimestamp(received: any) {
    const isValid = !isNaN(Date.parse(received));
    return {
      message: () => `expected ${received} to be a valid timestamp`,
      pass: isValid
    };
  }
});

// Global test utilities
const authHelper = new AuthTestHelper();

global.testUtils = {
  generateToken: (payload: any) => {
    return authHelper.generateToken(payload);
  },

  createTestUser: (overrides: any = {}) => {
    return authHelper.createTestCredentials(overrides);
  },

  hashPassword: async (password: string) => {
    return authHelper.hashPassword(password);
  }
};

// Setup test environment
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.DATABASE_TEST_URL = process.env.DATABASE_TEST_URL || 'postgresql://test:test@localhost:5433/austa_test';
  process.env.REDIS_TEST_HOST = process.env.REDIS_TEST_HOST || 'localhost';
  process.env.REDIS_TEST_PORT = process.env.REDIS_TEST_PORT || '6380';
  process.env.MONGODB_TEST_URL = process.env.MONGODB_TEST_URL || 'mongodb://localhost:27017/austa_test';
});

// Cleanup after all tests
afterAll(async () => {
  // Any global cleanup can go here
});

// Mock console methods to reduce test noise
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Mock timers for consistent testing
jest.setTimeout(30000); // 30 second timeout for integration tests