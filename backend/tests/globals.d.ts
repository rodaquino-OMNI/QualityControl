import { jest } from '@jest/globals';

declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        generateToken: (payload: any) => string;
        createMockRequest: (options?: any) => any;
        createMockResponse: () => any;
        createMockNext: () => jest.MockedFunction<any>;
      };
    }
  }
  
  var testUtils: {
    generateToken: (payload: any) => string;
    createMockRequest: (options?: any) => any;
    createMockResponse: () => any;
    createMockNext: () => jest.MockedFunction<any>;
  };

  namespace jest {
    interface Matchers<R> {
      toBeValidId(): R;
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}

export {};
