// Type validation utilities

import { 
  User, 
  Case, 
  CasePriority, 
  CaseStatus, 
  CaseType,
  DecisionType,
  NotificationType,
  NotificationPriority
} from '../types';

// Email validation
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// UUID validation
export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Phone validation
export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

// Date validation
export const isValidDate = (date: string | Date): boolean => {
  const d = date instanceof Date ? date : new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
};

// Enum validators
export const isValidCasePriority = (priority: string): priority is CasePriority => {
  return ['low', 'medium', 'high', 'critical'].includes(priority);
};

export const isValidCaseStatus = (status: string): status is CaseStatus => {
  return ['open', 'in_progress', 'pending_review', 'resolved', 'closed', 'escalated'].includes(status);
};

export const isValidCaseType = (type: string): type is CaseType => {
  return ['medical_necessity', 'prior_authorization', 'billing_dispute', 'fraud_investigation', 'quality_review', 'appeal'].includes(type);
};

export const isValidDecisionType = (type: string): type is DecisionType => {
  return ['approved', 'denied', 'pending', 'escalated', 'referred'].includes(type);
};

export const isValidNotificationType = (type: string): type is NotificationType => {
  return ['case_assigned', 'case_updated', 'case_escalated', 'decision_made', 'fraud_alert', 'system_alert', 'reminder'].includes(type);
};

export const isValidNotificationPriority = (priority: string): priority is NotificationPriority => {
  return ['low', 'medium', 'high', 'urgent'].includes(priority);
};

// Object validators
export const isValidUser = (user: any): user is User => {
  return (
    user &&
    typeof user === 'object' &&
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    isValidEmail(user.email) &&
    typeof user.firstName === 'string' &&
    typeof user.lastName === 'string' &&
    Array.isArray(user.roles) &&
    typeof user.isActive === 'boolean'
  );
};

export const isValidCase = (caseObj: any): caseObj is Case => {
  return (
    caseObj &&
    typeof caseObj === 'object' &&
    typeof caseObj.id === 'string' &&
    typeof caseObj.caseNumber === 'string' &&
    typeof caseObj.title === 'string' &&
    typeof caseObj.description === 'string' &&
    isValidCasePriority(caseObj.priority) &&
    isValidCaseStatus(caseObj.status) &&
    isValidCaseType(caseObj.type) &&
    typeof caseObj.createdById === 'string' &&
    (caseObj.createdAt instanceof Date || typeof caseObj.createdAt === 'string') &&
    (caseObj.updatedAt instanceof Date || typeof caseObj.updatedAt === 'string')
  );
};

// Form validators
export interface ValidationRule<T> {
  validate: (value: T) => boolean;
  message: string;
}

export interface ValidationSchema<T> {
  [K in keyof T]?: ValidationRule<T[K]>[];
}

export const required = <T>(message = 'This field is required'): ValidationRule<T> => ({
  validate: (value: T) => value !== null && value !== undefined && value !== '',
  message
});

export const minLength = (min: number, message?: string): ValidationRule<string> => ({
  validate: (value: string) => value.length >= min,
  message: message || `Must be at least ${min} characters`
});

export const maxLength = (max: number, message?: string): ValidationRule<string> => ({
  validate: (value: string) => value.length <= max,
  message: message || `Must be at most ${max} characters`
});

export const pattern = (regex: RegExp, message: string): ValidationRule<string> => ({
  validate: (value: string) => regex.test(value),
  message
});

export const email = (message = 'Invalid email address'): ValidationRule<string> => ({
  validate: isValidEmail,
  message
});

export const min = (minValue: number, message?: string): ValidationRule<number> => ({
  validate: (value: number) => value >= minValue,
  message: message || `Must be at least ${minValue}`
});

export const max = (maxValue: number, message?: string): ValidationRule<number> => ({
  validate: (value: number) => value <= maxValue,
  message: message || `Must be at most ${maxValue}`
});

export const between = (minValue: number, maxValue: number, message?: string): ValidationRule<number> => ({
  validate: (value: number) => value >= minValue && value <= maxValue,
  message: message || `Must be between ${minValue} and ${maxValue}`
});

// Validate object against schema
export const validate = <T extends object>(
  data: T,
  schema: ValidationSchema<T>
): { isValid: boolean; errors: Partial<Record<keyof T, string>> } => {
  const errors: Partial<Record<keyof T, string>> = {};
  let isValid = true;

  for (const field in schema) {
    const rules = schema[field];
    const value = data[field];

    if (rules) {
      for (const rule of rules) {
        if (!rule.validate(value)) {
          errors[field] = rule.message;
          isValid = false;
          break;
        }
      }
    }
  }

  return { isValid, errors };
};

// Password strength validator
export interface PasswordStrength {
  score: number; // 0-4
  feedback: string[];
}

export const checkPasswordStrength = (password: string): PasswordStrength => {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) {
    score++;
  } else {
    feedback.push('Password should be at least 8 characters long');
  }

  if (password.length >= 12) {
    score++;
  }

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score++;
  } else {
    feedback.push('Include both uppercase and lowercase letters');
  }

  if (/\d/.test(password)) {
    score++;
  } else {
    feedback.push('Include at least one number');
  }

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    score++;
  } else {
    feedback.push('Include at least one special character');
  }

  return { score: Math.min(score, 4), feedback };
};

// Sanitization utilities
export const sanitizeString = (str: string): string => {
  return str.trim().replace(/[<>]/g, '');
};

export const sanitizeEmail = (email: string): string => {
  return email.toLowerCase().trim();
};

export const sanitizePhone = (phone: string): string => {
  return phone.replace(/\D/g, '');
};