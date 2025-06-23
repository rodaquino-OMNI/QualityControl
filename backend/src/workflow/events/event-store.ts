/**
 * Event Sourcing and CQRS Implementation for Workflow State Management
 * Provides immutable event storage and command/query separation
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { WorkflowEvent } from '../types/workflow-definitions';
import { workflowRepository } from '../data/workflow-repository';

// Event Types
export enum WorkflowEventType {
  // Workflow Instance Events
  WORKFLOW_STARTED = 'workflow_started',
  WORKFLOW_COMPLETED = 'workflow_completed',
  WORKFLOW_FAILED = 'workflow_failed',
  WORKFLOW_CANCELLED = 'workflow_cancelled',
  WORKFLOW_SUSPENDED = 'workflow_suspended',
  WORKFLOW_RESUMED = 'workflow_resumed',
  
  // Step Events
  STEP_STARTED = 'step_started',
  STEP_COMPLETED = 'step_completed',
  STEP_FAILED = 'step_failed',
  STEP_SKIPPED = 'step_skipped',
  STEP_RETRIED = 'step_retried',
  STEP_TIMEOUT = 'step_timeout',
  
  // Decision Events
  DECISION_MADE = 'decision_made',
  DECISION_OVERRIDDEN = 'decision_overridden',
  APPROVAL_GRANTED = 'approval_granted',
  APPROVAL_DENIED = 'approval_denied',
  
  // Assignment Events
  TASK_ASSIGNED = 'task_assigned',
  TASK_REASSIGNED = 'task_reassigned',
  TASK_ESCALATED = 'task_escalated',
  
  // Integration Events
  INTEGRATION_CALLED = 'integration_called',
  INTEGRATION_RESPONSE = 'integration_response',
  INTEGRATION_FAILED = 'integration_failed',
  
  // Business Events
  RULE_EVALUATED = 'rule_evaluated',
  RULE_MATCHED = 'rule_matched',
  CONDITION_MET = 'condition_met',
  SLA_WARNING = 'sla_warning',
  SLA_BREACHED = 'sla_breached',
  
  // User Events
  USER_ACTION = 'user_action',
  COMMENT_ADDED = 'comment_added',
  DOCUMENT_UPLOADED = 'document_uploaded',
  
  // System Events
  CONFIGURATION_CHANGED = 'configuration_changed',
  ERROR_OCCURRED = 'error_occurred',
  AUDIT_EVENT = 'audit_event'
}

// Base Event Interface
export interface BaseWorkflowEvent {
  id: string;
  workflowInstanceId: string;
  stepExecutionId?: string;
  eventType: WorkflowEventType;
  eventData: any;
  source: string;
  userId?: string;
  correlationId: string;
  causationId?: string;
  traceId: string;
  timestamp: Date;
  version: number;
  metadata: Record<string, any>;
}

// Specific Event Types
export interface WorkflowStartedEvent extends BaseWorkflowEvent {
  eventType: WorkflowEventType.WORKFLOW_STARTED;
  eventData: {
    definitionId: string;
    definitionVersion: string;
    entityType: string;
    entityId: string;
    inputData: any;
    priority: string;
    assignedTo?: string;
  };
}

export interface StepStartedEvent extends BaseWorkflowEvent {
  eventType: WorkflowEventType.STEP_STARTED;
  eventData: {
    stepId: string;
    stepName: string;
    stepType: string;
    inputData: any;
    assignedTo?: string;
    timeout?: number;
  };
}

export interface DecisionMadeEvent extends BaseWorkflowEvent {
  eventType: WorkflowEventType.DECISION_MADE;
  eventData: {
    decision: string;
    rationale: string;
    confidence: number;
    rulesApplied: string[];
    alternatives: any[];
    reviewerId?: string;
  };
}

// Event Store Interface
export interface IEventStore {
  append(streamId: string, events: BaseWorkflowEvent[], expectedVersion: number): Promise<void>;
  getEvents(streamId: string, fromVersion?: number): Promise<BaseWorkflowEvent[]>;
  getEventsReverse(streamId: string, fromVersion?: number, maxCount?: number): Promise<BaseWorkflowEvent[]>;
  getAllEvents(fromPosition?: number, maxCount?: number): Promise<BaseWorkflowEvent[]>;
  getEventsByType(eventType: WorkflowEventType, fromPosition?: number): Promise<BaseWorkflowEvent[]>;
  subscribe(eventType: WorkflowEventType | '*', handler: (event: BaseWorkflowEvent) => void): void;
  createSnapshot(streamId: string, version: number, data: any): Promise<void>;
  getSnapshot(streamId: string): Promise<{ version: number; data: any } | null>;
}

// Event Store Implementation
export class PostgreSQLEventStore extends EventEmitter implements IEventStore {
  private prisma: PrismaClient;
  private subscriptions: Map<string, Array<(event: BaseWorkflowEvent) => void>> = new Map();

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
  }

  async append(
    streamId: string, 
    events: BaseWorkflowEvent[], 
    expectedVersion: number
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }

    try {
      // Check current version for optimistic concurrency control
      const instance = await workflowRepository.findWorkflowInstance({ id: streamId });
      const currentVersion = instance?.version || 0;
      
      if (currentVersion !== expectedVersion) {
        throw new Error(
          `Concurrency conflict: expected version ${expectedVersion}, but current version is ${currentVersion}`
        );
      }

      // Insert events
      const eventRecords = events.map((event, index) => ({
        id: event.id,
        workflowId: streamId,
        stepExecutionId: event.stepExecutionId,
        eventType: event.eventType,
        eventData: event.eventData,
        source: event.source,
        userId: event.userId,
        correlationId: event.correlationId,
        causationId: event.causationId,
        traceId: event.traceId,
        timestamp: event.timestamp,
        version: expectedVersion + index + 1,
        metadata: event.metadata
      }));

      await workflowRepository.createWorkflowEvents(eventRecords);

      // Update stream version
      if (instance) {
        await workflowRepository.updateWorkflowInstance(
          { id: streamId },
          { version: expectedVersion + events.length }
        );
      }

      // Emit events to subscribers
      events.forEach(event => {
        this.notifySubscribers(event);
      });

      logger.info('Events appended successfully', {
        streamId,
        eventCount: events.length,
        newVersion: expectedVersion + events.length
      });

    } catch (error) {
      logger.error('Failed to append events', {
        streamId,
        expectedVersion,
        eventCount: events.length,
        error: (error as Error).message
      });
      throw error;
    }
  }

  async getEvents(streamId: string, fromVersion: number = 0): Promise<BaseWorkflowEvent[]> {
    const eventRecords = await workflowRepository.findWorkflowEvents(
      {
        workflowId: streamId,
        version: { gt: fromVersion }
      },
      { version: 'asc' }
    );

    return eventRecords.map(this.mapToWorkflowEvent);
  }

  async getEventsReverse(
    streamId: string, 
    fromVersion?: number, 
    maxCount: number = 100
  ): Promise<BaseWorkflowEvent[]> {
    const eventRecords = await workflowRepository.findWorkflowEvents(
      {
        workflowId: streamId,
        ...(fromVersion ? { version: { lte: fromVersion } } : {})
      },
      { version: 'desc' },
      maxCount
    );

    return eventRecords.map(this.mapToWorkflowEvent);
  }

  async getAllEvents(fromPosition: number = 0, maxCount: number = 1000): Promise<BaseWorkflowEvent[]> {
    const eventRecords = await workflowRepository.findWorkflowEvents(
      {
        version: { gt: fromPosition }
      },
      { timestamp: 'asc' },
      maxCount
    );

    return eventRecords.map(this.mapToWorkflowEvent);
  }

  async getEventsByType(
    eventType: WorkflowEventType, 
    fromPosition: number = 0
  ): Promise<BaseWorkflowEvent[]> {
    const eventRecords = await workflowRepository.findWorkflowEvents(
      {
        eventType,
        version: { gt: fromPosition }
      },
      { timestamp: 'asc' }
    );

    return eventRecords.map(this.mapToWorkflowEvent);
  }

  subscribe(
    eventType: WorkflowEventType | '*', 
    handler: (event: BaseWorkflowEvent) => void
  ): void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    
    this.subscriptions.get(eventType)!.push(handler);
  }

  async createSnapshot(streamId: string, version: number, data: any): Promise<void> {
    await workflowRepository.upsertWorkflowSnapshot(
      { workflowId: streamId },
      {
        version,
        data: data,
        createdAt: new Date()
      }
    );
  }

  async getSnapshot(streamId: string): Promise<{ version: number; data: any } | null> {
    const snapshot = await workflowRepository.findWorkflowSnapshot(
      { workflowId: streamId }
    );

    return snapshot ? {
      version: snapshot.version,
      data: snapshot.data
    } : null;
  }

  private async getCurrentVersion(streamId: string): Promise<number> {
    const instance = await workflowRepository.findWorkflowInstance({ id: streamId });
    return instance?.version || 0;
  }

  private mapToWorkflowEvent(record: any): BaseWorkflowEvent {
    return {
      id: record.id,
      workflowInstanceId: record.workflowId,
      stepExecutionId: record.stepExecutionId,
      eventType: record.eventType as WorkflowEventType,
      eventData: record.eventData,
      source: record.source,
      userId: record.userId,
      correlationId: record.correlationId,
      causationId: record.causationId,
      traceId: record.traceId,
      timestamp: record.timestamp,
      version: record.version,
      metadata: record.metadata
    };
  }

  private notifySubscribers(event: BaseWorkflowEvent): void {
    // Notify specific event type subscribers
    const specificSubscribers = this.subscriptions.get(event.eventType) || [];
    specificSubscribers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        logger.error('Event subscriber error', {
          eventType: event.eventType,
          eventId: event.id,
          error: (error as Error).message
        });
      }
    });

    // Notify wildcard subscribers
    const wildcardSubscribers = this.subscriptions.get('*') || [];
    wildcardSubscribers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        logger.error('Wildcard event subscriber error', {
          eventType: event.eventType,
          eventId: event.id,
          error: (error as Error).message
        });
      }
    });
  }
}

// Event Factory
export class WorkflowEventFactory {
  static createWorkflowStartedEvent(
    workflowInstanceId: string,
    definitionId: string,
    definitionVersion: string,
    entityType: string,
    entityId: string,
    inputData: any,
    priority: string,
    userId?: string,
    assignedTo?: string,
    correlationId?: string
  ): WorkflowStartedEvent {
    return {
      id: uuidv4(),
      workflowInstanceId,
      eventType: WorkflowEventType.WORKFLOW_STARTED,
      eventData: {
        definitionId,
        definitionVersion,
        entityType,
        entityId,
        inputData,
        priority,
        assignedTo
      },
      source: 'workflow-engine',
      userId,
      correlationId: correlationId || uuidv4(),
      traceId: uuidv4(),
      timestamp: new Date(),
      version: 0,
      metadata: {}
    };
  }

  static createStepStartedEvent(
    workflowInstanceId: string,
    stepExecutionId: string,
    stepId: string,
    stepName: string,
    stepType: string,
    inputData: any,
    userId?: string,
    assignedTo?: string,
    timeout?: number,
    correlationId?: string
  ): StepStartedEvent {
    return {
      id: uuidv4(),
      workflowInstanceId,
      stepExecutionId,
      eventType: WorkflowEventType.STEP_STARTED,
      eventData: {
        stepId,
        stepName,
        stepType,
        inputData,
        assignedTo,
        timeout
      },
      source: 'workflow-engine',
      userId,
      correlationId: correlationId || uuidv4(),
      traceId: uuidv4(),
      timestamp: new Date(),
      version: 0,
      metadata: {}
    };
  }

  static createDecisionMadeEvent(
    workflowInstanceId: string,
    stepExecutionId: string,
    decision: string,
    rationale: string,
    confidence: number,
    rulesApplied: string[],
    alternatives: any[],
    userId?: string,
    reviewerId?: string,
    correlationId?: string
  ): DecisionMadeEvent {
    return {
      id: uuidv4(),
      workflowInstanceId,
      stepExecutionId,
      eventType: WorkflowEventType.DECISION_MADE,
      eventData: {
        decision,
        rationale,
        confidence,
        rulesApplied,
        alternatives,
        reviewerId
      },
      source: 'decision-engine',
      userId,
      correlationId: correlationId || uuidv4(),
      traceId: uuidv4(),
      timestamp: new Date(),
      version: 0,
      metadata: {}
    };
  }

  static createGenericEvent(
    workflowInstanceId: string,
    eventType: WorkflowEventType,
    eventData: any,
    source: string,
    userId?: string,
    stepExecutionId?: string,
    correlationId?: string,
    causationId?: string,
    metadata: Record<string, any> = {}
  ): BaseWorkflowEvent {
    return {
      id: uuidv4(),
      workflowInstanceId,
      stepExecutionId,
      eventType,
      eventData,
      source,
      userId,
      correlationId: correlationId || uuidv4(),
      causationId,
      traceId: uuidv4(),
      timestamp: new Date(),
      version: 0,
      metadata
    };
  }
}

// Aggregate Root Base Class
export abstract class AggregateRoot {
  protected id: string;
  protected version: number = 0;
  protected uncommittedEvents: BaseWorkflowEvent[] = [];

  constructor(id: string) {
    this.id = id;
  }

  getId(): string {
    return this.id;
  }

  getVersion(): number {
    return this.version;
  }

  getUncommittedEvents(): BaseWorkflowEvent[] {
    return [...this.uncommittedEvents];
  }

  markEventsAsCommitted(): void {
    this.uncommittedEvents = [];
  }

  protected applyEvent(event: BaseWorkflowEvent): void {
    this.handle(event);
    this.uncommittedEvents.push(event);
    this.version++;
  }

  protected abstract handle(event: BaseWorkflowEvent): void;

  static fromHistory<T extends AggregateRoot>(
    constructor: new (id: string) => T,
    events: BaseWorkflowEvent[]
  ): T {
    if (events.length === 0) {
      throw new Error('Cannot create aggregate from empty event history');
    }

    const aggregate = new constructor(events[0].workflowInstanceId);
    
    events.forEach(event => {
      aggregate.handle(event);
      aggregate.version++;
    });

    return aggregate;
  }
}

// Workflow Aggregate
export class WorkflowAggregate extends AggregateRoot {
  private status: string = 'pending';
  private currentStep?: string;
  private assignedTo?: string;
  private variables: Record<string, any> = {};
  private definitionId: string = '';
  private entityType: string = '';
  private entityId: string = '';

  constructor(id: string) {
    super(id);
  }

  // Command Methods
  startWorkflow(
    definitionId: string,
    definitionVersion: string,
    entityType: string,
    entityId: string,
    inputData: any,
    priority: string,
    userId?: string,
    assignedTo?: string
  ): void {
    if (this.status !== 'pending') {
      throw new Error(`Cannot start workflow in status: ${this.status}`);
    }

    const event = WorkflowEventFactory.createWorkflowStartedEvent(
      this.id,
      definitionId,
      definitionVersion,
      entityType,
      entityId,
      inputData,
      priority,
      userId,
      assignedTo
    );

    this.applyEvent(event);
  }

  startStep(
    stepExecutionId: string,
    stepId: string,
    stepName: string,
    stepType: string,
    inputData: any,
    userId?: string,
    assignedTo?: string,
    timeout?: number
  ): void {
    if (this.status !== 'running') {
      throw new Error(`Cannot start step when workflow is ${this.status}`);
    }

    const event = WorkflowEventFactory.createStepStartedEvent(
      this.id,
      stepExecutionId,
      stepId,
      stepName,
      stepType,
      inputData,
      userId,
      assignedTo,
      timeout
    );

    this.applyEvent(event);
  }

  makeDecision(
    stepExecutionId: string,
    decision: string,
    rationale: string,
    confidence: number,
    rulesApplied: string[],
    alternatives: any[],
    userId?: string,
    reviewerId?: string
  ): void {
    const event = WorkflowEventFactory.createDecisionMadeEvent(
      this.id,
      stepExecutionId,
      decision,
      rationale,
      confidence,
      rulesApplied,
      alternatives,
      userId,
      reviewerId
    );

    this.applyEvent(event);
  }

  // Event Handlers
  protected handle(event: BaseWorkflowEvent): void {
    switch (event.eventType) {
      case WorkflowEventType.WORKFLOW_STARTED:
        this.handleWorkflowStarted(event as WorkflowStartedEvent);
        break;
      case WorkflowEventType.STEP_STARTED:
        this.handleStepStarted(event as StepStartedEvent);
        break;
      case WorkflowEventType.DECISION_MADE:
        this.handleDecisionMade(event as DecisionMadeEvent);
        break;
      case WorkflowEventType.WORKFLOW_COMPLETED:
        this.status = 'completed';
        break;
      case WorkflowEventType.WORKFLOW_FAILED:
        this.status = 'failed';
        break;
      case WorkflowEventType.WORKFLOW_CANCELLED:
        this.status = 'cancelled';
        break;
      default:
        // Handle other events as needed
        break;
    }
  }

  private handleWorkflowStarted(event: WorkflowStartedEvent): void {
    this.status = 'running';
    this.definitionId = event.eventData.definitionId;
    this.entityType = event.eventData.entityType;
    this.entityId = event.eventData.entityId;
    this.assignedTo = event.eventData.assignedTo;
    this.variables = { ...event.eventData.inputData };
  }

  private handleStepStarted(event: StepStartedEvent): void {
    this.currentStep = event.eventData.stepId;
    if (event.eventData.assignedTo) {
      this.assignedTo = event.eventData.assignedTo;
    }
  }

  private handleDecisionMade(event: DecisionMadeEvent): void {
    this.variables.lastDecision = {
      decision: event.eventData.decision,
      rationale: event.eventData.rationale,
      confidence: event.eventData.confidence,
      timestamp: event.timestamp
    };
  }

  // Getters
  getStatus(): string {
    return this.status;
  }

  getCurrentStep(): string | undefined {
    return this.currentStep;
  }

  getAssignedTo(): string | undefined {
    return this.assignedTo;
  }

  getVariables(): Record<string, any> {
    return { ...this.variables };
  }

  getDefinitionId(): string {
    return this.definitionId;
  }
}

export const eventStore = new PostgreSQLEventStore(new PrismaClient());