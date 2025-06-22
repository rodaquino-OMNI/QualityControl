// Central type definitions for backend

// Re-export analytics types
export * from './analytics';

// Authentication types
export interface AuthUser {
  id: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  roles: string[];
  isActive: boolean;
  mfaEnabled: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends AuthTokens {
  user: AuthUser;
  requiresMFA?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  deviceId?: string;
}

export interface MFAVerifyRequest {
  userId: string;
  token: string;
  deviceId?: string;
}

export interface OAuthUserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  provider: string;
}

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

// Case types
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
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

export enum CasePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum CaseStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  PENDING_REVIEW = 'pending_review',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  ESCALATED = 'escalated'
}

export enum CaseType {
  MEDICAL_NECESSITY = 'medical_necessity',
  PRIOR_AUTH = 'prior_authorization',
  BILLING_DISPUTE = 'billing_dispute',
  FRAUD_INVESTIGATION = 'fraud_investigation',
  QUALITY_REVIEW = 'quality_review',
  APPEAL = 'appeal'
}

export enum FraudRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

// User types
export interface User {
  id: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  isActive: boolean;
  mfaEnabled: boolean;
  roles?: Role[];
  permissions?: Permission[];
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions?: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  description?: string;
}

// Patient types
export interface Patient {
  id: string;
  patientNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
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
  effectiveDate?: Date;
  expirationDate?: Date;
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
  createdAt: Date;
}

export interface Note {
  id: string;
  caseId: string;
  content: string;
  isInternal: boolean;
  authorId: string;
  author?: User;
  createdAt: Date;
  updatedAt?: Date;
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
  createdAt: Date;
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
  createdAt: Date;
}

export enum DecisionType {
  APPROVED = 'approved',
  DENIED = 'denied',
  PENDING = 'pending',
  ESCALATED = 'escalated',
  REFERRED = 'referred'
}

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
  readAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export enum NotificationType {
  CASE_ASSIGNED = 'case_assigned',
  CASE_UPDATED = 'case_updated',
  CASE_ESCALATED = 'case_escalated',
  DECISION_MADE = 'decision_made',
  FRAUD_ALERT = 'fraud_alert',
  SYSTEM_ALERT = 'system_alert',
  REMINDER = 'reminder'
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Audit types
export interface AuditLog {
  id: string;
  userId?: string;
  user?: User;
  action: string;
  entityType: string;
  entityId?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// Queue types
export interface QueueJob {
  id: string;
  queue: string;
  type: string;
  data: Record<string, any>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  error?: string;
  result?: any;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying'
}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: Date;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
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

// Rate limiting types
export interface RateLimitInfo {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

// Session types
export interface Session {
  id: string;
  userId: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  lastActivity: Date;
  expiresAt: Date;
  createdAt: Date;
}

// AI Analysis types
export interface AIAnalysis {
  id: string;
  entityType: string;
  entityId: string;
  analysisType: string;
  result: AIAnalysisResult;
  confidence: number;
  createdAt: Date;
}

export interface AIAnalysisResult {
  recommendation: 'approved' | 'denied' | 'partial' | 'review';
  confidence: number;
  explanation: string;
  riskFactors: AIRiskFactor[];
  similarCases: AISimilarCase[];
  medicalContext: AIMedicalContext;
  modelVersion: string;
  processingTime: number;
}

export interface AIRiskFactor {
  factor: string;
  score: number;
  description: string;
}

export interface AISimilarCase {
  caseId: string;
  similarity: number;
  decision: string;
  procedureCode?: string;
  value?: number;
  decidedAt?: Date;
}

export interface AIMedicalContext {
  guidelines: string[];
  protocols: string[];
  evidence: string[];
}

// AI Conversation types
export interface AIConversation {
  id: string;
  userId: string;
  caseId?: string;
  title?: string;
  context: Record<string, any>;
  messages?: AIMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AIMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  confidence?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

// AI Chat types
export interface AIChatRequest {
  message: string;
  caseId: string;
  conversationId?: string;
}

export interface AIChatResponse {
  response: string;
  conversationId: string;
  confidence: number;
  sources: string[];
}

// AI Fraud Detection types
export interface AIFraudDetectionResult {
  fraudScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  indicators: AIFraudIndicator[];
  modelVersion: string;
}

export interface AIFraudIndicator {
  type: string;
  description: string;
  severity: string;
  confidence: number;
}

// AI Service Case Data interface
export interface AICaseData {
  id: string;
  procedureCode: string;
  procedureDescription: string;
  value: number;
  patient: {
    id: string;
    age?: number;
    gender?: string;
    medicalHistory?: Record<string, unknown>;
  };
  attachments?: Array<{
    id: string;
    type: string;
    url?: string;
    content?: string;
  }>;
  metadata?: Record<string, any>;
}

// AI Analysis Request types
export interface AIAnalysisRequest {
  caseId: string;
  forceReanalysis?: boolean;
  analysisType?: 'full' | 'quick' | 'fraud_only' | 'medical_only';
}

// Webhook types
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  headers?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, any>;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  response?: {
    status: number;
    body?: any;
  };
  error?: string;
  createdAt: Date;
  deliveredAt?: Date;
}