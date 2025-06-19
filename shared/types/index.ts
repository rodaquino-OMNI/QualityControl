// Shared type definitions for both frontend and backend

// User related types
export interface User {
  id: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  roles: Role[];
  permissions?: Permission[];
  isActive: boolean;
  mfaEnabled?: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  lastLoginAt?: string | Date;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions?: Permission[];
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  description?: string;
}

// Authentication types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  deviceId?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username?: string;
}

export interface MFAVerifyRequest {
  userId: string;
  token: string;
  deviceId?: string;
}

// Case related types
export interface Case {
  id: string;
  caseNumber: string;
  title: string;
  description: string;
  priority: CasePriority;
  status: CaseStatus;
  type: CaseType;
  fraudRiskLevel?: FraudRiskLevel;
  assignedToId?: string;
  assignedTo?: User;
  createdById: string;
  createdBy?: User;
  patientId?: string;
  patient?: Patient;
  providerId?: string;
  provider?: Provider;
  amount?: number;
  aiConfidenceScore?: number;
  aiRecommendation?: string;
  documents?: Document[];
  notes?: Note[];
  activities?: Activity[];
  tags?: string[];
  createdAt: string | Date;
  updatedAt: string | Date;
  closedAt?: string | Date;
}

export type CasePriority = 'low' | 'medium' | 'high' | 'critical';
export type CaseStatus = 'open' | 'in_progress' | 'pending_review' | 'resolved' | 'closed' | 'escalated';
export type CaseType = 'medical_necessity' | 'prior_authorization' | 'billing_dispute' | 'fraud_investigation' | 'quality_review' | 'appeal';
export type FraudRiskLevel = 'low' | 'medium' | 'high';

// Patient types
export interface Patient {
  id: string;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | Date;
  gender?: string;
  email?: string;
  phone?: string;
  address?: Address;
  insuranceInfo?: InsuranceInfo;
}

// Provider types
export interface Provider {
  id: string;
  providerNumber: string;
  name: string;
  type: string;
  speciality?: string;
  taxId?: string;
  npi?: string;
  address?: Address;
  contactInfo?: ContactInfo;
  riskScore?: number;
}

// Supporting types
export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
}

export interface ContactInfo {
  phone?: string;
  fax?: string;
  email?: string;
  website?: string;
}

export interface InsuranceInfo {
  insurerId: string;
  policyNumber: string;
  groupNumber?: string;
  effectiveDate?: string | Date;
  expirationDate?: string | Date;
}

export interface Document {
  id: string;
  caseId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url?: string;
  uploadedById: string;
  uploadedBy?: User;
  createdAt: string | Date;
}

export interface Note {
  id: string;
  caseId: string;
  content: string;
  isInternal: boolean;
  authorId: string;
  author?: User;
  createdAt: string | Date;
  updatedAt?: string | Date;
}

export interface Activity {
  id: string;
  caseId?: string;
  userId?: string;
  user?: User;
  action: string;
  entityType: string;
  entityId?: string;
  description?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string | Date;
}

// Decision types
export interface Decision {
  id: string;
  caseId: string;
  case?: Case;
  deciderId: string;
  decider?: User;
  decision: DecisionType;
  reason: string;
  aiAssisted: boolean;
  aiConfidenceScore?: number;
  aiRecommendation?: string;
  overriddenAI?: boolean;
  createdAt: string | Date;
}

export type DecisionType = 'approved' | 'denied' | 'pending' | 'escalated' | 'referred';

// Notification types
export interface Notification {
  id: string;
  userId: string;
  user?: User;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  read: boolean;
  readAt?: string | Date;
  metadata?: Record<string, any>;
  createdAt: string | Date;
}

export type NotificationType = 'case_assigned' | 'case_updated' | 'case_escalated' | 'decision_made' | 'fraud_alert' | 'system_alert' | 'reminder';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

// API Response types
export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  status: 'success' | 'error';
  error?: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ErrorResponse {
  error: string;
  code: string;
  details?: ValidationError[];
  timestamp?: string;
}

// Query types
export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterQuery {
  search?: string;
  status?: string | string[];
  priority?: string | string[];
  type?: string | string[];
  assignedTo?: string;
  createdBy?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CaseQuery extends PaginationQuery, FilterQuery {
  includeDeleted?: boolean;
}

// Dashboard types
export interface DashboardStats {
  totalCases: number;
  activeCases: number;
  resolvedToday: number;
  criticalCases: number;
  casesByStatus: Record<CaseStatus, number>;
  casesByPriority: Record<CasePriority, number>;
  recentActivity: Activity[];
}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string | Date;
  services: {
    database: ServiceHealth;
    redis?: ServiceHealth;
    queues?: ServiceHealth;
    ai?: ServiceHealth;
  };
}

export interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
}

// WebSocket event types
export interface WebSocketEvent<T = any> {
  type: string;
  payload: T;
  timestamp: string;
}

export interface CaseUpdateEvent extends WebSocketEvent<Case> {
  type: 'case:update';
}

export interface NotificationEvent extends WebSocketEvent<Notification> {
  type: 'notification:new';
}

// Form types
export interface CaseFormData {
  title: string;
  description: string;
  priority: CasePriority;
  type: CaseType;
  patientId?: string;
  providerId?: string;
  amount?: number;
  tags?: string[];
}

export interface NoteFormData {
  content: string;
  isInternal: boolean;
}

export interface DecisionFormData {
  decision: DecisionType;
  reason: string;
}

// Export utility types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncReturnType<T extends (...args: any) => Promise<any>> = T extends (...args: any) => Promise<infer R> ? R : any;