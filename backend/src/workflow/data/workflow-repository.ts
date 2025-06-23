/**
 * Workflow Repository - Temporary Data Access Layer
 * This provides a temporary implementation until workflow models are added to main Prisma schema
 */

import { PrismaClient } from '@prisma/client';
import { 
  WorkflowInstance, 
  WorkflowEvent, 
  WorkflowStepExecution,
  WorkflowType 
} from '../types/workflow-definitions';

interface WorkflowSnapshot {
  workflowId: string;
  version: number;
  data: any;
  createdAt: Date;
}

interface WorkflowMetric {
  id: string;
  workflowId: string;
  metricName: string;
  metricValue: number;
  dimensions: Record<string, any>;
  timestamp: Date;
}

/**
 * Temporary in-memory storage for workflow data
 * Replace with actual Prisma queries when models are added to schema
 */
class InMemoryWorkflowStore {
  private instances: Map<string, WorkflowInstance> = new Map();
  private events: Map<string, WorkflowEvent[]> = new Map();
  private snapshots: Map<string, WorkflowSnapshot> = new Map();
  private metrics: WorkflowMetric[] = [];
  private stepExecutions: Map<string, WorkflowStepExecution[]> = new Map();

  // Instance methods
  async createInstance(data: any): Promise<WorkflowInstance> {
    const instance: WorkflowInstance = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.instances.set(instance.id, instance);
    return instance;
  }

  async updateInstance(id: string, data: any): Promise<WorkflowInstance | null> {
    const instance = this.instances.get(id);
    if (!instance) return null;
    
    const updated = {
      ...instance,
      ...data,
      updatedAt: new Date()
    };
    this.instances.set(id, updated);
    return updated;
  }

  async findInstance(id: string): Promise<WorkflowInstance | null> {
    return this.instances.get(id) || null;
  }

  async countInstances(where: any): Promise<number> {
    let count = 0;
    for (const instance of this.instances.values()) {
      if (this.matchesWhere(instance, where)) {
        count++;
      }
    }
    return count;
  }

  // Event methods
  async createEvents(events: any[]): Promise<void> {
    for (const event of events) {
      const workflowId = event.workflowId;
      if (!this.events.has(workflowId)) {
        this.events.set(workflowId, []);
      }
      this.events.get(workflowId)!.push(event);
    }
  }

  async findEvents(where: any): Promise<WorkflowEvent[]> {
    const allEvents: WorkflowEvent[] = [];
    for (const events of this.events.values()) {
      for (const event of events) {
        if (this.matchesWhere(event, where)) {
          allEvents.push(event);
        }
      }
    }
    return allEvents;
  }

  // Snapshot methods
  async upsertSnapshot(workflowId: string, data: any): Promise<void> {
    this.snapshots.set(workflowId, {
      workflowId,
      version: data.version,
      data: data.data,
      createdAt: new Date()
    });
  }

  async findSnapshot(workflowId: string): Promise<WorkflowSnapshot | null> {
    return this.snapshots.get(workflowId) || null;
  }

  // Metric methods
  async createMetric(data: any): Promise<void> {
    this.metrics.push({
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date()
    });
  }

  // Helper method to match where clauses
  private matchesWhere(obj: any, where: any): boolean {
    for (const key in where) {
      if (typeof where[key] === 'object' && where[key] !== null) {
        // Handle nested conditions like { gte, lte }
        for (const op in where[key]) {
          const value = where[key][op];
          switch (op) {
            case 'gte':
              if (obj[key] < value) return false;
              break;
            case 'lte':
              if (obj[key] > value) return false;
              break;
            case 'gt':
              if (obj[key] <= value) return false;
              break;
            case 'lt':
              if (obj[key] >= value) return false;
              break;
            default:
              if (obj[key] !== value) return false;
          }
        }
      } else {
        if (obj[key] !== where[key]) return false;
      }
    }
    return true;
  }
}

// Singleton instance
const store = new InMemoryWorkflowStore();

/**
 * Workflow Repository with temporary implementation
 */
export class WorkflowRepository {
  constructor(private prisma: PrismaClient) {}

  // WorkflowInstance operations
  async createWorkflowInstance(data: any): Promise<WorkflowInstance> {
    return store.createInstance(data);
  }

  async updateWorkflowInstance(where: { id: string }, data: any): Promise<WorkflowInstance> {
    const updated = await store.updateInstance(where.id, data);
    if (!updated) {
      throw new Error(`Workflow instance ${where.id} not found`);
    }
    return updated;
  }

  async findWorkflowInstance(where: { id: string }): Promise<WorkflowInstance | null> {
    return store.findInstance(where.id);
  }

  async countWorkflowInstances(where: any): Promise<number> {
    return store.countInstances(where);
  }

  // WorkflowEvent operations
  async createWorkflowEvents(data: any[]): Promise<{ count: number }> {
    await store.createEvents(data);
    return { count: data.length };
  }

  async findWorkflowEvents(where: any, orderBy?: any, take?: number): Promise<WorkflowEvent[]> {
    let events = await store.findEvents(where);
    
    // Simple ordering implementation
    if (orderBy) {
      const key = Object.keys(orderBy)[0];
      const order = orderBy[key];
      events.sort((a, b) => {
        const aVal = (a as any)[key];
        const bVal = (b as any)[key];
        return order === 'asc' ? 
          (aVal > bVal ? 1 : -1) : 
          (aVal < bVal ? 1 : -1);
      });
    }
    
    if (take) {
      events = events.slice(0, take);
    }
    
    return events;
  }

  // WorkflowSnapshot operations
  async upsertWorkflowSnapshot(where: { workflowId: string }, data: any): Promise<void> {
    await store.upsertSnapshot(where.workflowId, data);
  }

  async findWorkflowSnapshot(where: { workflowId: string }): Promise<WorkflowSnapshot | null> {
    return store.findSnapshot(where.workflowId);
  }

  // WorkflowMetric operations
  async createWorkflowMetric(data: any): Promise<void> {
    await store.createMetric(data);
  }
}

// Export a default instance
export const workflowRepository = new WorkflowRepository(new PrismaClient());