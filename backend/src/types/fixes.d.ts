// Type fixes for common TypeScript errors

import { Decimal } from '@prisma/client/runtime/library';

// Helper type to convert Decimal to number
export type DecimalToNumber<T> = T extends Decimal ? number : T;

// Helper to convert all Decimal fields in an object to numbers
export type ConvertDecimals<T> = {
  [K in keyof T]: DecimalToNumber<T[K]>;
};

// Fixed aggregate types for Prisma queries that TypeScript struggles with
export interface AggregateResult<T> {
  _count?: number;
  _sum?: Partial<T>;
  _avg?: Partial<T>;
  _min?: Partial<T>;
  _max?: Partial<T>;
}

// Type-safe error handling
export type TypedError = Error & {
  statusCode?: number;
  code?: string;
};

// Index signature types for dynamic access
export type IndexedObject<T = any> = {
  [key: string]: T;
};

// Risk category weights with index signature
export interface RiskCategoryWeights extends IndexedObject<number> {
  low: number;
  medium: number;
  high: number;
  critical?: number;
}

// Urgency weights with index signature
export interface UrgencyWeights extends IndexedObject<number> {
  routine: number;
  urgent: number;
  emergency: number;
}

// Condition weights with index signature
export interface ConditionWeights extends IndexedObject<number> {
  diabetes: number;
  heart_disease: number;
  cancer: number;
  kidney_disease: number;
  mental_health: number;
  default: number;
}