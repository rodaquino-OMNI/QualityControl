/**
 * Workflow Definition Types and Interfaces
 * Comprehensive type system for healthcare workflow automation
 */

export enum WorkflowType {
  PRIOR_AUTHORIZATION = 'prior_authorization',
  CLAIMS_PROCESSING = 'claims_processing',
  APPEAL_MANAGEMENT = 'appeal_management',
  PROVIDER_CREDENTIALING = 'provider_credentialing',
  QUALITY_AUDIT = 'quality_audit',
  FRAUD_INVESTIGATION = 'fraud_investigation',
  MEDICAL_REVIEW = 'medical_review',
  BENEFIT_VERIFICATION = 'benefit_verification'
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  DEPRECATED = 'deprecated',
  ARCHIVED = 'archived'
}

export enum StepType {
  TASK = 'task',
  DECISION = 'decision',
  INTEGRATION = 'integration',
  WAIT = 'wait',
  PARALLEL = 'parallel',
  LOOP = 'loop',
  SUBPROCESS = 'subprocess',
  EVENT = 'event',
  TIMER = 'timer',
  MANUAL = 'manual'
}

export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  GREATER_EQUAL = 'greater_equal',
  LESS_EQUAL = 'less_equal',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  IN = 'in',
  NOT_IN = 'not_in',
  IS_NULL = 'is_null',
  IS_NOT_NULL = 'is_not_null',
  REGEX_MATCH = 'regex_match',
  DATE_BEFORE = 'date_before',
  DATE_AFTER = 'date_after',
  AGE_GREATER = 'age_greater',
  AGE_LESS = 'age_less'
}

export enum ActionType {
  APPROVE = 'approve',
  DENY = 'deny',
  PEND = 'pend',
  REQUEST_INFO = 'request_info',
  ESCALATE = 'escalate',
  ASSIGN = 'assign',
  NOTIFY = 'notify',
  INTEGRATE = 'integrate',
  CALCULATE = 'calculate',
  VALIDATE = 'validate',
  TRANSFORM = 'transform',
  DELAY = 'delay'
}

export interface Duration {
  value: number;
  unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
}

export interface Condition {
  id: string;
  field: string;
  operator: ConditionOperator;
  value: any;
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  caseSensitive?: boolean;
  description?: string;
}

export interface CompositeCondition {
  id: string;
  operator: 'AND' | 'OR' | 'NOT';
  conditions: (Condition | CompositeCondition)[];
  description?: string;
}

export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  defaultValue?: any;
  required: boolean;
  description?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
}

export interface DataMapping {
  source: string;
  target: string;
  transformation?: string;
  defaultValue?: any;
  required: boolean;
}

export interface IntegrationConfig {
  id: string;
  name: string;
  type: 'ehr' | 'payer' | 'provider' | 'clearinghouse' | 'api' | 'database' | 'hl7' | 'fhir' | 'x12' | 'sftp';
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  timeout: Duration;
  retryPolicy: RetryPolicy;
  authentication: AuthenticationConfig;
  dataMapping: DataMapping[];
  responseMapping: DataMapping[];
  errorHandling: ErrorHandlingConfig;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffType: 'fixed' | 'exponential' | 'linear';
  initialDelay: Duration;
  maxDelay?: Duration;
  retryConditions: string[];
}

export interface AuthenticationConfig {
  type: 'none' | 'basic' | 'bearer' | 'oauth2' | 'apikey' | 'certificate';
  credentials?: {
    username?: string;
    password?: string;
    token?: string;
    apiKey?: string;
    clientId?: string;
    clientSecret?: string;
    scope?: string[];
  };
  refreshable?: boolean;
}

export interface ErrorHandlingConfig {
  onError: 'fail' | 'retry' | 'skip' | 'escalate' | 'fallback';
  fallbackStep?: string;
  escalationRule?: EscalationRule;
  errorMapping: Record<string, string>;
}

export interface NotificationConfig {
  type: 'email' | 'sms' | 'push' | 'webhook' | 'slack' | 'teams';
  recipients: string[];
  template: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  conditions?: (Condition | CompositeCondition)[];
}

export interface EscalationRule {
  id: string;
  name: string;
  trigger: 'timeout' | 'error' | 'condition' | 'manual';
  condition?: (Condition | CompositeCondition);
  timeout?: Duration;
  escalateTo: string[]; // User IDs or role names
  notification: NotificationConfig;
  actions: WorkflowAction[];
}

export interface SLAConfiguration {
  target: Duration;
  warning: Duration;
  critical: Duration;
  businessHours?: {
    timezone: string;
    days: number[]; // 0-6, 0 = Sunday
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    holidays: string[]; // ISO date strings
  };
  escalations: EscalationRule[];
}

export interface ComplianceRequirement {
  id: string;
  name: string;
  regulation: 'HIPAA' | 'GDPR' | 'SOC2' | 'STATE' | 'CMS' | 'FDA';
  requirement: string;
  controls: string[];
  auditRequired: boolean;
  retentionPeriod?: Duration;
}

export interface WorkflowAction {
  id: string;
  type: ActionType;
  parameters: Record<string, any>;
  conditions?: (Condition | CompositeCondition)[];
  notifications?: NotificationConfig[];
  integrations?: string[]; // Integration IDs
  description?: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  type: StepType;
  executor: string; // Service or handler name
  inputVariables: string[];
  outputVariables: string[];
  conditions?: (Condition | CompositeCondition)[];
  actions: WorkflowAction[];
  timeout?: Duration;
  escalation?: EscalationRule[];
  nextSteps: string[]; // Next step IDs
  errorHandling: ErrorHandlingConfig;
  sla?: SLAConfiguration;
  assignmentRules?: AssignmentRule[];
  metadata?: Record<string, any>;
}

export interface AssignmentRule {
  id: string;
  name: string;
  priority: number;
  conditions: (Condition | CompositeCondition)[];
  assignTo: {
    type: 'user' | 'role' | 'group' | 'queue';
    value: string;
  };
  workloadBalancing?: {
    enabled: boolean;
    maxConcurrent: number;
    algorithm: 'round_robin' | 'least_loaded' | 'random' | 'priority';
  };
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  type: WorkflowType;
  status: WorkflowStatus;
  
  // Workflow Configuration
  variables: WorkflowVariable[];
  steps: WorkflowStep[];
  startStep: string;
  endSteps: string[];
  
  // Business Configuration
  businessRules: string[]; // Business rule IDs
  integrations: IntegrationConfig[];
  sla: SLAConfiguration;
  compliance: ComplianceRequirement[];
  
  // Technical Configuration
  concurrency: {
    maxInstances: number;
    parallelSteps: boolean;
    timeout: Duration;
  };
  
  // Audit and Monitoring
  auditLevel: 'minimal' | 'standard' | 'detailed' | 'comprehensive';
  monitoring: {
    enabled: boolean;
    metrics: string[];
    alerts: string[];
  };
  
  // Metadata
  tags: string[];
  category: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  effectiveDate?: Date;
  expirationDate?: Date;
}

export interface WorkflowInstance {
  id: string;
  definitionId: string;
  definitionVersion: string;
  entityType: 'authorization_request' | 'claim' | 'case' | 'patient' | 'provider';
  entityId: string;
  
  // Instance State
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'suspended';
  currentStep?: string;
  currentStepStartedAt?: Date;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  
  // Data Context
  variables: Record<string, any>;
  inputData: Record<string, any>;
  outputData?: Record<string, any>;
  
  // Execution Tracking
  startedAt: Date;
  completedAt?: Date;
  duration?: Duration;
  stepHistory: WorkflowStepExecution[];
  
  // Assignment and Ownership
  assignedTo?: string;
  assignedAt?: Date;
  createdBy: string;
  
  // SLA and Escalation
  slaStatus: 'on_track' | 'at_risk' | 'breached';
  dueDate?: Date;
  escalationLevel: number;
  
  // Metadata
  tags: string[];
  metadata: Record<string, any>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStepExecution {
  id: string;
  workflowInstanceId: string;
  stepId: string;
  stepName: string;
  
  // Execution State
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retrying';
  attempt: number;
  
  // Timing
  startedAt: Date;
  completedAt?: Date;
  duration?: Duration;
  
  // Data
  inputData: Record<string, any>;
  outputData?: Record<string, any>;
  error?: {
    message: string;
    code: string;
    details: any;
    stackTrace?: string;
  };
  
  // Assignment
  assignedTo?: string;
  assignedAt?: Date;
  completedBy?: string;
  
  // Metadata
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowEvent {
  id: string;
  workflowInstanceId: string;
  stepExecutionId?: string;
  
  // Event Details
  eventType: string;
  eventData: any;
  source: string;
  
  // Context
  userId?: string;
  correlationId: string;
  causationId?: string;
  traceId: string;
  
  // Timing
  timestamp: Date;
  
  // Metadata
  metadata: Record<string, any>;
}

// Workflow DSL Types for Configuration
export interface WorkflowDSL {
  workflow: {
    name: string;
    version: string;
    type: string;
    description?: string;
  };
  
  variables?: Record<string, {
    type: string;
    default?: any;
    required?: boolean;
    description?: string;
  }>;
  
  steps: Record<string, {
    type: string;
    name?: string;
    description?: string;
    executor?: string;
    input?: Record<string, any>;
    output?: string[];
    when?: any; // Condition expression
    timeout?: string;
    retry?: {
      attempts: number;
      delay: string;
    };
    on?: {
      success?: string | string[];
      failure?: string | string[];
      timeout?: string | string[];
    };
  }>;
  
  start: string;
  
  sla?: {
    target: string;
    warning: string;
    critical: string;
  };
  
  compliance?: string[];
  
  integrations?: Record<string, {
    type: string;
    endpoint: string;
    method?: string;
    auth?: any;
    mapping?: Record<string, string>;
  }>;
}

// Helper types for workflow validation
export interface WorkflowValidationError {
  path: string;
  message: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
}

export interface WorkflowValidationResult {
  isValid: boolean;
  errors: WorkflowValidationError[];
  warnings: WorkflowValidationError[];
}

// All types are already exported individually - no need for circular export