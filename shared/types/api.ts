// API endpoint type definitions

import { 
  User, 
  Case, 
  Decision, 
  Notification, 
  Activity,
  CaseFormData,
  NoteFormData,
  DecisionFormData,
  LoginRequest,
  RegisterRequest,
  MFAVerifyRequest,
  AuthResponse,
  CaseQuery,
  PaginatedResponse,
  ApiResponse,
  DashboardStats,
  HealthStatus
} from './index';

// Authentication endpoints
export interface AuthEndpoints {
  '/auth/login': {
    POST: {
      body: LoginRequest;
      response: ApiResponse<AuthResponse>;
    };
  };
  '/auth/register': {
    POST: {
      body: RegisterRequest;
      response: ApiResponse<{ user: User; message: string }>;
    };
  };
  '/auth/logout': {
    POST: {
      body: { refreshToken?: string };
      response: ApiResponse<{ message: string }>;
    };
  };
  '/auth/refresh': {
    POST: {
      body: { refreshToken: string };
      response: ApiResponse<{ accessToken: string; refreshToken: string }>;
    };
  };
  '/auth/me': {
    GET: {
      response: ApiResponse<User>;
    };
  };
  '/auth/mfa/enable': {
    POST: {
      response: ApiResponse<{ secret: string; qrCode: string; message: string }>;
    };
  };
  '/auth/mfa/disable': {
    POST: {
      body: { token: string };
      response: ApiResponse<{ message: string }>;
    };
  };
  '/auth/mfa/verify': {
    POST: {
      body: MFAVerifyRequest;
      response: ApiResponse<AuthResponse>;
    };
  };
}

// User endpoints
export interface UserEndpoints {
  '/users': {
    GET: {
      query?: {
        page?: number;
        pageSize?: number;
        search?: string;
        role?: string;
        isActive?: boolean;
      };
      response: ApiResponse<PaginatedResponse<User>>;
    };
    POST: {
      body: {
        email: string;
        firstName: string;
        lastName: string;
        username?: string;
        roles?: string[];
      };
      response: ApiResponse<User>;
    };
  };
  '/users/:id': {
    GET: {
      params: { id: string };
      response: ApiResponse<User>;
    };
    PATCH: {
      params: { id: string };
      body: Partial<{
        firstName: string;
        lastName: string;
        username: string;
        avatar: string;
        isActive: boolean;
      }>;
      response: ApiResponse<User>;
    };
    DELETE: {
      params: { id: string };
      response: ApiResponse<{ message: string }>;
    };
  };
  '/users/:id/roles': {
    PUT: {
      params: { id: string };
      body: { roles: string[] };
      response: ApiResponse<User>;
    };
  };
}

// Case endpoints
export interface CaseEndpoints {
  '/cases': {
    GET: {
      query?: CaseQuery;
      response: ApiResponse<PaginatedResponse<Case>>;
    };
    POST: {
      body: CaseFormData;
      response: ApiResponse<Case>;
    };
  };
  '/cases/:id': {
    GET: {
      params: { id: string };
      response: ApiResponse<Case>;
    };
    PATCH: {
      params: { id: string };
      body: Partial<CaseFormData>;
      response: ApiResponse<Case>;
    };
    DELETE: {
      params: { id: string };
      response: ApiResponse<{ message: string }>;
    };
  };
  '/cases/:id/assign': {
    POST: {
      params: { id: string };
      body: { userId: string };
      response: ApiResponse<Case>;
    };
  };
  '/cases/:id/notes': {
    GET: {
      params: { id: string };
      response: ApiResponse<Note[]>;
    };
    POST: {
      params: { id: string };
      body: NoteFormData;
      response: ApiResponse<Note>;
    };
  };
  '/cases/:id/documents': {
    GET: {
      params: { id: string };
      response: ApiResponse<Document[]>;
    };
    POST: {
      params: { id: string };
      body: FormData;
      response: ApiResponse<Document>;
    };
  };
  '/cases/:id/activities': {
    GET: {
      params: { id: string };
      query?: {
        page?: number;
        pageSize?: number;
      };
      response: ApiResponse<PaginatedResponse<Activity>>;
    };
  };
}

// Decision endpoints
export interface DecisionEndpoints {
  '/decisions': {
    GET: {
      query?: {
        caseId?: string;
        deciderId?: string;
        decision?: string;
        page?: number;
        pageSize?: number;
      };
      response: ApiResponse<PaginatedResponse<Decision>>;
    };
    POST: {
      body: DecisionFormData & { caseId: string };
      response: ApiResponse<Decision>;
    };
  };
  '/decisions/:id': {
    GET: {
      params: { id: string };
      response: ApiResponse<Decision>;
    };
  };
}

// Notification endpoints
export interface NotificationEndpoints {
  '/notifications': {
    GET: {
      query?: {
        read?: boolean;
        type?: string;
        priority?: string;
        page?: number;
        pageSize?: number;
      };
      response: ApiResponse<PaginatedResponse<Notification>>;
    };
  };
  '/notifications/:id': {
    GET: {
      params: { id: string };
      response: ApiResponse<Notification>;
    };
  };
  '/notifications/:id/read': {
    POST: {
      params: { id: string };
      response: ApiResponse<Notification>;
    };
  };
  '/notifications/mark-all-read': {
    POST: {
      response: ApiResponse<{ message: string; count: number }>;
    };
  };
}

// Dashboard endpoints
export interface DashboardEndpoints {
  '/dashboard/stats': {
    GET: {
      response: ApiResponse<DashboardStats>;
    };
  };
  '/dashboard/activities': {
    GET: {
      query?: {
        limit?: number;
      };
      response: ApiResponse<Activity[]>;
    };
  };
}

// Health endpoints
export interface HealthEndpoints {
  '/health': {
    GET: {
      response: HealthStatus;
    };
  };
  '/health/ready': {
    GET: {
      response: { ready: boolean };
    };
  };
  '/health/live': {
    GET: {
      response: { alive: boolean };
    };
  };
}

// Combined API type
export type ApiEndpoints = AuthEndpoints & 
  UserEndpoints & 
  CaseEndpoints & 
  DecisionEndpoints & 
  NotificationEndpoints & 
  DashboardEndpoints & 
  HealthEndpoints;

// Helper types for API client
export type EndpointPath = keyof ApiEndpoints;
export type EndpointMethod<P extends EndpointPath> = keyof ApiEndpoints[P];
export type EndpointConfig<P extends EndpointPath, M extends EndpointMethod<P>> = ApiEndpoints[P][M];

// Request config type
export interface RequestConfig<P extends EndpointPath, M extends EndpointMethod<P>> {
  path: P;
  method: M;
  params?: EndpointConfig<P, M> extends { params: infer Params } ? Params : never;
  query?: EndpointConfig<P, M> extends { query: infer Query } ? Query : never;
  body?: EndpointConfig<P, M> extends { body: infer Body } ? Body : never;
}

// Response type helper
export type ApiResponseType<P extends EndpointPath, M extends EndpointMethod<P>> = 
  EndpointConfig<P, M> extends { response: infer R } ? R : never;