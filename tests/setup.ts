import '@testing-library/jest-dom';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
} as any;

// Mock TextEncoder/TextDecoder for Node.js environment
if (typeof global.TextEncoder === 'undefined') {
  const util = require('util');
  global.TextEncoder = util.TextEncoder;
  global.TextDecoder = util.TextDecoder as any;
}

// Mock setImmediate for Node.js polyfills
if (typeof global.setImmediate === 'undefined') {
  const setImmediateFn = (fn: any, ...args: any[]) => setTimeout(fn, 0, ...args);
  setImmediateFn.__promisify__ = () => new Promise(resolve => setImmediateFn(resolve));
  global.setImmediate = setImmediateFn as any;
  global.clearImmediate = (id: any) => clearTimeout(id);
}