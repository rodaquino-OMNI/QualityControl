// Type definitions for handling nullable database fields
import { Decimal } from '@prisma/client/runtime/library';

// Database types with proper null handling
export interface CaseWithRelations {
  id: string;
  procedureCode: string | null;
  procedureDescription: string | null;
  value: Decimal | null;
  status: string;
  priority: string;
  metadata: unknown;
  patient?: {
    id: string;
    name: string | null;
    birthYear: number | null;
    gender: string | null;
    metadata: unknown;
  } | null;
  attachments?: Array<{
    id: string;
    fileType: string | null;
    url: string | null;
  }>;
  aIAnalyses?: Array<{
    id: string;
    recommendation: string;
    confidence: number;
    explanation: string;
  }>;
}

// Type guards for null checking
export function isValidDecimal(value: Decimal | null | undefined): value is Decimal {
  return value !== null && value !== undefined;
}

export function toNumber(value: Decimal | null | undefined, defaultValue: number = 0): number {
  if (!isValidDecimal(value)) return defaultValue;
  return Number(value.toString());
}

// Aggregate result types with proper null handling
export interface AggregateResult<T> {
  _count: number | null;
  _avg: Partial<T> | null;
  _sum: Partial<T> | null;
  _min: Partial<T> | null;
  _max: Partial<T> | null;
}

// Helper to safely access aggregate values
export function getAggregateValue<T, K extends keyof T>(
  aggregate: AggregateResult<T> | null,
  operation: '_avg' | '_sum' | '_min' | '_max',
  field: K,
  defaultValue: T[K]
): T[K] {
  if (!aggregate || !aggregate[operation]) return defaultValue;
  const value = aggregate[operation]![field];
  return value ?? defaultValue;
}