// Utility type definitions

// Make all properties optional recursively
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

// Make all properties required recursively
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends (infer U)[]
    ? DeepRequired<U>[]
    : T[P] extends object
    ? DeepRequired<T[P]>
    : T[P];
};

// Make all properties readonly recursively
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T[P] extends object
    ? DeepReadonly<T[P]>
    : T[P];
};

// Extract keys of type T that have values of type V
export type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

// Omit multiple properties
export type OmitMultiple<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Pick multiple properties and make them optional
export type PickPartial<T, K extends keyof T> = Partial<Pick<T, K>>;

// Pick multiple properties and make them required
export type PickRequired<T, K extends keyof T> = Required<Pick<T, K>>;

// Make specific properties optional
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Make specific properties required
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

// Extract promise type
export type Awaited<T> = T extends Promise<infer U> ? U : T;

// Extract array element type
export type ArrayElement<T> = T extends ReadonlyArray<infer U> ? U : never;

// Convert union to intersection
export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

// Get function arguments type
export type ArgumentTypes<F extends Function> = F extends (...args: infer A) => any ? A : never;

// Get function return type
export type ReturnType<F extends Function> = F extends (...args: any[]) => infer R ? R : never;

// Merge two types
export type Merge<T, U> = Omit<T, keyof U> & U;

// Make properties nullable
export type Nullable<T> = {
  [P in keyof T]: T[P] | null;
};

// Make specific properties nullable
export type NullableBy<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: T[P] | null;
};

// Remove null and undefined from type
export type NonNullable<T> = T extends null | undefined ? never : T;

// XOR type (exclusive or)
export type XOR<T, U> = T | U extends object
  ? (T & { [K in Exclude<keyof U, keyof T>]?: never }) |
    (U & { [K in Exclude<keyof T, keyof U>]?: never })
  : T | U;

// Exact type (no extra properties)
export type Exact<T, U extends T> = T & {
  [K in Exclude<keyof U, keyof T>]: never;
};

// Value of object
export type ValueOf<T> = T[keyof T];

// Entries type
export type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

// Type guard helpers
export type TypeGuard<T> = (value: unknown) => value is T;

// Branded types for type safety
export type Brand<T, B> = T & { __brand: B };

// Common branded types
export type UUID = Brand<string, 'UUID'>;
export type Email = Brand<string, 'Email'>;
export type URL = Brand<string, 'URL'>;
export type Timestamp = Brand<number, 'Timestamp'>;
export type NonEmptyString = Brand<string, 'NonEmptyString'>;
export type PositiveNumber = Brand<number, 'PositiveNumber'>;

// Pagination types
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// Sort types
export interface Sortable<T> {
  field: keyof T;
  order: 'asc' | 'desc';
}

// Filter types
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'like' | 'between';

export interface Filter<T> {
  field: keyof T;
  operator: FilterOperator;
  value: any;
}

// Result types
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// Maybe type (similar to Option in other languages)
export type Maybe<T> = T | null | undefined;

// Either type
export type Either<L, R> =
  | { type: 'left'; value: L }
  | { type: 'right'; value: R };

// Dictionary type
export type Dictionary<T> = Record<string, T>;

// Constructor type
export type Constructor<T = {}> = new (...args: any[]) => T;

// Mixin type
export type Mixin<T extends Constructor[]> = T extends [
  infer First,
  ...infer Rest
]
  ? First extends Constructor<infer A>
    ? Rest extends Constructor[]
      ? Constructor<A & InstanceType<Mixin<Rest>>>
      : never
    : never
  : Constructor<{}>;

// Type safe object keys
export const objectKeys = <T extends object>(obj: T): (keyof T)[] => {
  return Object.keys(obj) as (keyof T)[];
};

// Type safe object entries
export const objectEntries = <T extends object>(obj: T): Entries<T> => {
  return Object.entries(obj) as Entries<T>;
};

// Type predicates
export const isString = (value: unknown): value is string => {
  return typeof value === 'string';
};

export const isNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value);
};

export const isBoolean = (value: unknown): value is boolean => {
  return typeof value === 'boolean';
};

export const isObject = (value: unknown): value is object => {
  return value !== null && typeof value === 'object';
};

export const isArray = <T>(value: unknown): value is T[] => {
  return Array.isArray(value);
};

export const isFunction = (value: unknown): value is Function => {
  return typeof value === 'function';
};

export const isNull = (value: unknown): value is null => {
  return value === null;
};

export const isUndefined = (value: unknown): value is undefined => {
  return value === undefined;
};

export const isNullOrUndefined = (value: unknown): value is null | undefined => {
  return value === null || value === undefined;
};