import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from 'express-validator';
import {
  handleValidationErrors,
  validate,
  commonValidations,
  customValidators,
} from '../../../src/middleware/validation.middleware';
import { AppError } from '../../../src/middleware/errorHandler';

// Mock express-validator
jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
  ValidationChain: jest.fn(),
}));

// Mock error handler
jest.mock('../../../src/middleware/errorHandler', () => ({
  AppError: jest.fn(),
}));

describe('validation.middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = (global as any).testUtils.createMockRequest();
    mockResponse = (global as any).testUtils.createMockResponse();
    mockNext = (global as any).testUtils.createMockNext();
  });

  describe('handleValidationErrors', () => {
    it('should call next when no validation errors', () => {
      const { validationResult } = require('express-validator');
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      handleValidationErrors(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
      expect(AppError).not.toHaveBeenCalled();
    });

    it('should throw AppError when validation errors exist', () => {
      const mockErrors = [
        {
          type: 'field',
          path: 'email',
          msg: 'Invalid email format',
          value: 'invalid-email',
        },
        {
          type: 'field',
          path: 'password',
          msg: 'Password too short',
          value: '123',
        },
      ];

      const { validationResult } = require('express-validator');
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => mockErrors,
      });

      expect(() => {
        handleValidationErrors(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );
      }).toThrow();

      expect(AppError).toHaveBeenCalledWith(
        'Validation failed',
        400,
        'VALIDATION_ERROR',
        [
          {
            field: 'email',
            message: 'Invalid email format',
            value: 'invalid-email',
          },
          {
            field: 'password',
            message: 'Password too short',
            value: '123',
          },
        ]
      );
    });

    it('should handle non-field validation errors', () => {
      const mockErrors = [
        {
          type: 'alternative',
          msg: 'Custom validation error',
        },
      ];

      const { validationResult } = require('express-validator');
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => mockErrors,
      });

      expect(() => {
        handleValidationErrors(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );
      }).toThrow();

      expect(AppError).toHaveBeenCalledWith(
        'Validation failed',
        400,
        'VALIDATION_ERROR',
        [
          {
            field: undefined,
            message: 'Custom validation error',
            value: undefined,
          },
        ]
      );
    });
  });

  describe('validate', () => {
    it('should run all validation chains and handle errors', async () => {
      const mockValidationChain1 = {
        run: jest.fn().mockResolvedValue(null),
      };
      const mockValidationChain2 = {
        run: jest.fn().mockResolvedValue(null),
      };

      const { validationResult } = require('express-validator');
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      const validationMiddleware = validate([mockValidationChain1 as any, mockValidationChain2 as any]);
      
      await validationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockValidationChain1.run).toHaveBeenCalledWith(mockRequest);
      expect(mockValidationChain2.run).toHaveBeenCalledWith(mockRequest);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle validation chain errors', async () => {
      const mockValidationChain = {
        run: jest.fn().mockRejectedValue(new Error('Validation chain error')),
      };

      const validationMiddleware = validate([mockValidationChain as any]);
      
      await expect(validationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      )).rejects.toThrow('Validation chain error');
    });
  });

  describe('commonValidations', () => {
    describe('pagination', () => {
      it('should return correct page validation schema', () => {
        const schema = commonValidations.pagination.page();
        
        expect(schema).toEqual({
          in: ['query'],
          optional: true,
          isInt: {
            options: { min: 1 },
            errorMessage: 'Page must be a positive integer',
          },
          toInt: true,
        });
      });

      it('should return correct limit validation schema', () => {
        const schema = commonValidations.pagination.limit();
        
        expect(schema).toEqual({
          in: ['query'],
          optional: true,
          isInt: {
            options: { min: 1, max: 100 },
            errorMessage: 'Limit must be between 1 and 100',
          },
          toInt: true,
        });
      });
    });

    describe('id', () => {
      it('should return correct UUID validation schema', () => {
        const schema = commonValidations.id.uuid('userId');
        
        expect(schema).toEqual({
          in: ['params'],
          isUUID: {
            errorMessage: 'userId must be a valid UUID',
          },
        });
      });

      it('should return correct MongoDB ID validation schema', () => {
        const schema = commonValidations.id.mongoId('objectId');
        
        expect(schema).toEqual({
          in: ['params'],
          isMongoId: {
            errorMessage: 'objectId must be a valid MongoDB ObjectId',
          },
        });
      });
    });

    describe('string', () => {
      it('should return correct required string validation schema', () => {
        const schema = commonValidations.string.required('username', 3, 20);
        
        expect(schema).toEqual({
          in: ['body'],
          notEmpty: {
            errorMessage: 'username is required',
          },
          isLength: {
            options: { min: 3, max: 20 },
            errorMessage: 'username must be between 3 and 20 characters',
          },
          trim: true,
        });
      });

      it('should return correct optional string validation schema', () => {
        const schema = commonValidations.string.optional('description');
        
        expect(schema).toEqual({
          in: ['body'],
          optional: true,
          isLength: {
            options: { min: 1, max: 255 },
            errorMessage: 'description must be between 1 and 255 characters',
          },
          trim: true,
        });
      });
    });

    describe('email', () => {
      it('should return correct email validation schema', () => {
        const schema = commonValidations.email('userEmail');
        
        expect(schema).toEqual({
          in: ['body'],
          isEmail: {
            errorMessage: 'Please provide a valid email address',
          },
          normalizeEmail: true,
        });
      });
    });

    describe('password', () => {
      it('should return correct password validation schema', () => {
        const schema = commonValidations.password('userPassword');
        
        expect(schema).toEqual({
          in: ['body'],
          isLength: {
            options: { min: 8 },
            errorMessage: 'Password must be at least 8 characters long',
          },
          matches: {
            options: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
            errorMessage: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
          },
        });
      });
    });

    describe('number', () => {
      it('should return correct integer validation schema', () => {
        const schema = commonValidations.number.int('age', 18, 120);
        
        expect(schema).toEqual({
          in: ['body'],
          isInt: {
            options: { min: 18, max: 120 },
            errorMessage: 'age must be an integer >= 18 <= 120',
          },
          toInt: true,
        });
      });

      it('should return correct float validation schema', () => {
        const schema = commonValidations.number.float('price', 0.01, 1000000);
        
        expect(schema).toEqual({
          in: ['body'],
          isFloat: {
            options: { min: 0.01, max: 1000000 },
            errorMessage: 'price must be a number >= 0.01 <= 1000000',
          },
          toFloat: true,
        });
      });
    });

    describe('array', () => {
      it('should return correct non-empty array validation schema', () => {
        const schema = commonValidations.array.notEmpty('tags');
        
        expect(schema).toEqual({
          in: ['body'],
          isArray: {
            errorMessage: 'tags must be an array',
          },
          notEmpty: {
            errorMessage: 'tags cannot be empty',
          },
        });
      });

      it('should return correct optional array validation schema', () => {
        const schema = commonValidations.array.optional('categories');
        
        expect(schema).toEqual({
          in: ['body'],
          optional: true,
          isArray: {
            errorMessage: 'categories must be an array',
          },
        });
      });
    });

    describe('enum', () => {
      it('should return correct enum validation schema', () => {
        const values = ['admin', 'user', 'guest'];
        const schema = commonValidations.enum('role', values);
        
        expect(schema).toEqual({
          in: ['body'],
          isIn: {
            options: [values],
            errorMessage: 'role must be one of: admin, user, guest',
          },
        });
      });
    });
  });

  describe('customValidators', () => {
    describe('exists', () => {
      it('should return validator function that checks existence', async () => {
        const mockModel = {
          findOne: jest.fn().mockResolvedValue({ id: '123' } as any),
        };

        const validator = await customValidators.exists(mockModel, 'email');
        const result = await validator('test@example.com');

        expect(mockModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
        expect(result).toBe(true);
      });

      it('should throw error when value does not exist', async () => {
        const mockModel = {
          findOne: jest.fn().mockResolvedValue(null as any),
        };

        const validator = await customValidators.exists(mockModel, 'email', 'Email not found');
        
        await expect(validator('nonexistent@example.com'))
          .rejects.toThrow('Email not found');
      });
    });

    describe('unique', () => {
      it('should return validator function that checks uniqueness', async () => {
        const mockModel = {
          findOne: jest.fn().mockResolvedValue(null as any),
        };
        const mockReq = { params: {} };

        const validator = await customValidators.unique(mockModel, 'email');
        const result = await validator('test@example.com', { req: mockReq });

        expect(mockModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
        expect(result).toBe(true);
      });

      it('should throw error when value is not unique', async () => {
        const mockModel = {
          findOne: jest.fn().mockResolvedValue({ id: '123' } as any),
        };
        const mockReq = { params: {} };

        const validator = await customValidators.unique(mockModel, 'email', 'Email already exists');
        
        await expect(validator('existing@example.com', { req: mockReq }))
          .rejects.toThrow('Email already exists');
      });

      it('should exclude current record when excludeId is provided', async () => {
        const mockModel = {
          findOne: jest.fn().mockResolvedValue(null as any),
        };
        const mockReq = { params: { id: '456' } };

        const validator = await customValidators.unique(mockModel, 'email', undefined, 'id');
        await validator('test@example.com', { req: mockReq });

        expect(mockModel.findOne).toHaveBeenCalledWith({
          email: 'test@example.com',
          _id: { $ne: '456' },
        });
      });
    });
  });
});
