import { jest } from '@jest/globals';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/austa_test';

// Mock logger to reduce noise in tests
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Global test utilities
(global as any).testUtils = {
  generateToken: (payload: any) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
  },
  
  createMockRequest: (options: any = {}) => ({
    body: {},
    query: {},
    params: {},
    headers: {},
    user: null,
    ip: '127.0.0.1',
    get: jest.fn(),
    ...options,
  }),
  
  createMockResponse: () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.set = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    res.statusCode = 200;
    return res;
  },
  
  createMockNext: () => jest.fn(),
};

// Extend Jest matchers
expect.extend({
  toBeValidId(received) {
    const pass = /^[0-9a-fA-F]{24}$/.test(received) || /^\d+$/.test(received);
    return {
      pass,
      message: () => `expected ${received} to be a valid ID`,
    };
  },
  
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () => 
        `expected ${received} to be within range ${floor} - ${ceiling}`,
    };
  },
});

// Clean up after tests
afterAll(async () => {
  // Close database connections, clear caches, etc.
});