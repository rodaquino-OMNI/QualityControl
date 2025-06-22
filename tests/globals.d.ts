import { jest } from '@jest/globals';

declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        generateToken: (payload: any) => string;
        createTestUser: (overrides?: any) => any;
        hashPassword: (password: string) => Promise<string>;
      };
    }
  }
  
  var testUtils: {
    generateToken: (payload: any) => string;
    createTestUser: (overrides?: any) => any;
    hashPassword: (password: string) => Promise<string>;
  };

  namespace jest {
    interface Matchers<R> {
      toBeValidId(): R;
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}

export {};