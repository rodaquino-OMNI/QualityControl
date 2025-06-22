import { Request, Response, NextFunction } from 'express';
const { validationResult } = require('express-validator');
import { AppError } from './errorHandler';

/**
 * Middleware to handle validation errors from express-validator
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((error: { type?: string; path?: string; msg: string; value?: unknown }) => ({
      field: error.type === 'field' ? error.path : undefined,
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined,
    }));

    throw new AppError(
      'Validation failed',
      400,
      'VALIDATION_ERROR',
      formattedErrors
    );
  }
  
  next();
};

/**
 * Creates a validation middleware chain
 */
export const validate = (validations: Array<{ run: (req: Request) => Promise<void> }>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));
    
    // Handle any validation errors
    handleValidationErrors(req, res, next);
  };
};

/**
 * Common validation schemas
 */
export const commonValidations = {
  // Pagination
  pagination: {
    page: (field = 'page') => ({
      in: ['query'],
      optional: true,
      isInt: {
        options: { min: 1 },
        errorMessage: 'Page must be a positive integer',
      },
      toInt: true,
    }),
    limit: (field = 'limit') => ({
      in: ['query'],
      optional: true,
      isInt: {
        options: { min: 1, max: 100 },
        errorMessage: 'Limit must be between 1 and 100',
      },
      toInt: true,
    }),
  },

  // ID validation
  id: {
    uuid: (field = 'id') => ({
      in: ['params'],
      isUUID: {
        errorMessage: `${field} must be a valid UUID`,
      },
    }),
    mongoId: (field = 'id') => ({
      in: ['params'],
      isMongoId: {
        errorMessage: `${field} must be a valid MongoDB ObjectId`,
      },
    }),
  },

  // String validations
  string: {
    required: (field: string, min = 1, max = 255) => ({
      in: ['body'],
      notEmpty: {
        errorMessage: `${field} is required`,
      },
      isLength: {
        options: { min, max },
        errorMessage: `${field} must be between ${min} and ${max} characters`,
      },
      trim: true,
    }),
    optional: (field: string, min = 1, max = 255) => ({
      in: ['body'],
      optional: true,
      isLength: {
        options: { min, max },
        errorMessage: `${field} must be between ${min} and ${max} characters`,
      },
      trim: true,
    }),
  },

  // Email validation
  email: (field = 'email') => ({
    in: ['body'],
    isEmail: {
      errorMessage: 'Please provide a valid email address',
    },
    normalizeEmail: true,
  }),

  // Date validation
  date: {
    iso: (field: string) => ({
      in: ['body'],
      isISO8601: {
        errorMessage: `${field} must be a valid ISO 8601 date`,
      },
      toDate: true,
    }),
    future: (field: string) => ({
      in: ['body'],
      isISO8601: {
        errorMessage: `${field} must be a valid ISO 8601 date`,
      },
      custom: {
        options: (value: string) => new Date(value) > new Date(),
        errorMessage: `${field} must be in the future`,
      },
      toDate: true,
    }),
  },

  // Boolean validation
  boolean: (field: string) => ({
    in: ['body'],
    isBoolean: {
      errorMessage: `${field} must be a boolean`,
    },
    toBoolean: true,
  }),

  // Number validation
  number: {
    int: (field: string, min?: number, max?: number) => ({
      in: ['body'],
      isInt: {
        options: { min, max },
        errorMessage: `${field} must be an integer${min !== undefined ? ` >= ${min}` : ''}${max !== undefined ? ` <= ${max}` : ''}`,
      },
      toInt: true,
    }),
    float: (field: string, min?: number, max?: number) => ({
      in: ['body'],
      isFloat: {
        options: { min, max },
        errorMessage: `${field} must be a number${min !== undefined ? ` >= ${min}` : ''}${max !== undefined ? ` <= ${max}` : ''}`,
      },
      toFloat: true,
    }),
  },

  // Array validation
  array: {
    notEmpty: (field: string) => ({
      in: ['body'],
      isArray: {
        errorMessage: `${field} must be an array`,
      },
      notEmpty: {
        errorMessage: `${field} cannot be empty`,
      },
    }),
    optional: (field: string) => ({
      in: ['body'],
      optional: true,
      isArray: {
        errorMessage: `${field} must be an array`,
      },
    }),
  },

  // Enum validation
  enum: (field: string, values: string[]) => ({
    in: ['body'],
    isIn: {
      options: [values],
      errorMessage: `${field} must be one of: ${values.join(', ')}`,
    },
  }),

  // Password validation
  password: (field = 'password') => ({
    in: ['body'],
    isLength: {
      options: { min: 8 },
      errorMessage: 'Password must be at least 8 characters long',
    },
    matches: {
      options: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      errorMessage: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    },
  }),

  // Phone validation
  phone: (field = 'phone') => ({
    in: ['body'],
    isMobilePhone: {
      options: 'any' as any,
      errorMessage: 'Please provide a valid phone number',
    },
  }),

  // URL validation
  url: (field: string) => ({
    in: ['body'],
    isURL: {
      options: {
        protocols: ['http', 'https'],
        require_protocol: true,
      },
      errorMessage: `${field} must be a valid URL`,
    },
  }),
};

/**
 * Custom validators
 */
export const customValidators = {
  // Check if value exists in database
  exists: async (Model: any, field: string, message?: string) => {
    return async (value: any) => {
      const exists = await Model.findOne({ [field]: value });
      if (!exists) {
        throw new Error(message || `${field} does not exist`);
      }
      return true;
    };
  },

  // Check if value is unique in database
  unique: async (Model: any, field: string, message?: string, excludeId?: string) => {
    return async (value: any, { req }: any) => {
      const query: any = { [field]: value };
      if (excludeId && req.params[excludeId]) {
        query._id = { $ne: req.params[excludeId] };
      }
      const exists = await Model.findOne(query);
      if (exists) {
        throw new Error(message || `${field} already exists`);
      }
      return true;
    };
  },
};