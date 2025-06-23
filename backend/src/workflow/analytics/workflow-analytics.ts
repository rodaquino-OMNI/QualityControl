/**
 * Workflow Analytics and Monitoring System
 * Provides real-time insights into workflow performance and healthcare operations
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { 
  BaseWorkflowEvent, 
  WorkflowEventType, 
  PostgreSQLEventStore 
} from '../events/event-store';
import { WorkflowType } from '../types/workflow-definitions';
import { workflowRepository } from '../data/workflow-repository';

// Analytics Interfaces
export interface WorkflowMetric {
  id: string;
  workflowType: WorkflowType;
  metricName: string;
  metricValue: number;
  unit: string;
  dimensions: Record<string, string>;
  timestamp: Date;
  period: 'real_time' | 'hourly' | 'daily' | 'weekly' | 'monthly';
}

export interface PerformanceMetrics {
  totalWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  averageCompletionTime: number;
  medianCompletionTime: number;
  successRate: number;
  throughput: number;
  currentActiveWorkflows: number;
  slaBreaches: number;
  escalations: number;
}

export interface WorkflowAnalytics {
  timeRange: {
    start: Date;
    end: Date;
  };
  performance: PerformanceMetrics;
  stepAnalytics: StepAnalytics[];
  ruleAnalytics: RuleAnalytics[];
  integrationAnalytics: IntegrationAnalytics[];
  userAnalytics: UserAnalytics[];
  trends: TrendAnalysis[];
  bottlenecks: BottleneckAnalysis[];
  recommendations: AnalyticsRecommendation[];
}

export interface StepAnalytics {
  stepId: string;
  stepName: string;
  stepType: string;
  executionCount: number;
  averageExecutionTime: number;
  successRate: number;
  failureRate: number;
  mostCommonErrors: ErrorSummary[];
  assignmentMetrics: AssignmentMetrics;
}

export interface RuleAnalytics {
  ruleId: string;
  ruleName: string;
  category: string;
  evaluationCount: number;
  matchRate: number;
  averageConfidence: number;
  impactMetrics: {
    approvalsInfluenced: number;
    denialsInfluenced: number;
    escalationsTriggered: number;
  };
}

export interface IntegrationAnalytics {
  integrationName: string;
  integrationType: string;
  requestCount: number;
  successRate: number;
  averageResponseTime: number;
  errorRate: number;
  mostCommonErrors: ErrorSummary[];
  throughput: number;
}

export interface UserAnalytics {
  userId: string;
  userName: string;
  role: string;
  tasksCompleted: number;
  averageTaskTime: number;
  decisionAccuracy: number;
  workloadMetrics: {
    currentAssignments: number;
    overdueAssignments: number;
    escalatedTasks: number;
  };
}

export interface ErrorSummary {
  errorCode: string;
  errorMessage: string;
  count: number;
  lastOccurrence: Date;
  impact: 'low' | 'medium' | 'high' | 'critical';
}

export interface AssignmentMetrics {
  totalAssignments: number;
  averageAssignmentTime: number;
  reassignmentRate: number;
  escalationRate: number;
  workloadDistribution: Record<string, number>;
}

export interface TrendAnalysis {
  metric: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
  timeframe: string;
  significance: 'high' | 'medium' | 'low';
}

export interface BottleneckAnalysis {
  type: 'step' | 'integration' | 'rule' | 'assignment';
  identifier: string;
  name: string;
  severity: 'high' | 'medium' | 'low';
  impact: {
    affectedWorkflows: number;
    averageDelay: number;
    costImpact?: number;
  };
  recommendedActions: string[];
}

export interface AnalyticsRecommendation {
  type: 'performance' | 'efficiency' | 'quality' | 'cost';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expectedImpact: string;
  implementationComplexity: 'low' | 'medium' | 'high';
  actions: string[];
}

// Real-time Analytics Engine
export class WorkflowAnalyticsEngine extends EventEmitter {
  private prisma: PrismaClient;
  private eventStore: PostgreSQLEventStore;
  private metricsCache: Map<string, WorkflowMetric[]> = new Map();
  private alertThresholds: Map<string, number> = new Map();

  constructor(prisma: PrismaClient, eventStore: PostgreSQLEventStore) {
    super();
    this.prisma = prisma;
    this.eventStore = eventStore;
    this.setupEventSubscriptions();
    this.setupDefaultAlertThresholds();
  }

  /**
   * Get comprehensive workflow analytics for a time range
   */
  async getWorkflowAnalytics(
    workflowType?: WorkflowType,
    timeRange?: { start: Date; end: Date },
    includeRealTime: boolean = true
  ): Promise<WorkflowAnalytics> {
    const range = timeRange || {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      end: new Date()
    };

    const [
      performance,
      stepAnalytics,
      ruleAnalytics,
      integrationAnalytics,
      userAnalytics,
      trends,
      bottlenecks
    ] = await Promise.all([
      this.getPerformanceMetrics(workflowType, range),
      this.getStepAnalytics(workflowType, range),
      this.getRuleAnalytics(workflowType, range),
      this.getIntegrationAnalytics(workflowType, range),
      this.getUserAnalytics(workflowType, range),
      this.getTrendAnalysis(workflowType, range),
      this.getBottleneckAnalysis(workflowType, range)
    ]);

    const recommendations = await this.generateRecommendations(
      performance,
      stepAnalytics,
      bottlenecks
    );

    return {
      timeRange: range,
      performance,
      stepAnalytics,
      ruleAnalytics,
      integrationAnalytics,
      userAnalytics,
      trends,
      bottlenecks,
      recommendations
    };
  }

  /**
   * Get real-time performance metrics
   */
  async getPerformanceMetrics(
    workflowType?: WorkflowType,
    timeRange?: { start: Date; end: Date }
  ): Promise<PerformanceMetrics> {
    const range = timeRange || {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date()
    };

    const whereClause = {
      createdAt: {
        gte: range.start,
        lte: range.end
      },
      ...(workflowType && { 
        definition: { 
          type: workflowType 
        } 
      })
    };

    const [
      totalWorkflows,
      completedWorkflows,
      failedWorkflows,
      activeWorkflows,
      completionTimes,
      slaBreaches,
      escalations
    ] = await Promise.all([
      workflowRepository.countWorkflowInstances(whereClause),
      workflowRepository.countWorkflowInstances({
        ...whereClause, status: 'completed'
      }),
      workflowRepository.countWorkflowInstances({
        ...whereClause, status: 'failed' 
      }),
      workflowRepository.countWorkflowInstances({
        ...whereClause, status: 'running'
      }),
      this.getCompletionTimes(whereClause),
      this.getSLABreaches(whereClause),
      this.getEscalationCount(whereClause)
    ]);

    const successRate = totalWorkflows > 0 ? 
      (completedWorkflows / totalWorkflows) * 100 : 0;

    const throughput = this.calculateThroughput(
      totalWorkflows,
      range.start,
      range.end
    );

    return {
      totalWorkflows,
      completedWorkflows,
      failedWorkflows,
      averageCompletionTime: completionTimes.average,
      medianCompletionTime: completionTimes.median,
      successRate,
      throughput,
      currentActiveWorkflows: activeWorkflows,
      slaBreaches,
      escalations
    };
  }

  /**
   * Get step-level analytics
   */
  async getStepAnalytics(
    workflowType?: WorkflowType,
    timeRange?: { start: Date; end: Date }
  ): Promise<StepAnalytics[]> {
    const events = await this.eventStore.getEventsByType(
      WorkflowEventType.STEP_STARTED
    );

    const stepGroups = new Map<string, any[]>();
    
    events.forEach(event => {
      const stepId = event.eventData.stepId;
      if (!stepGroups.has(stepId)) {
        stepGroups.set(stepId, []);
      }
      stepGroups.get(stepId)!.push(event);
    });

    const analytics: StepAnalytics[] = [];

    for (const [stepId, stepEvents] of stepGroups) {
      const stepAnalytics = await this.analyzeStepPerformance(stepId, stepEvents);
      analytics.push(stepAnalytics);
    }

    return analytics.sort((a, b) => b.executionCount - a.executionCount);
  }

  /**
   * Get rule analytics
   */
  async getRuleAnalytics(
    workflowType?: WorkflowType,
    timeRange?: { start: Date; end: Date }
  ): Promise<RuleAnalytics[]> {
    const ruleEvaluationEvents = await this.eventStore.getEventsByType(
      WorkflowEventType.RULE_EVALUATED
    );

    const ruleGroups = new Map<string, any[]>();
    
    ruleEvaluationEvents.forEach(event => {
      const ruleId = event.eventData.ruleId;
      if (!ruleGroups.has(ruleId)) {
        ruleGroups.set(ruleId, []);
      }
      ruleGroups.get(ruleId)!.push(event);
    });

    const analytics: RuleAnalytics[] = [];

    for (const [ruleId, events] of ruleGroups) {
      const ruleAnalytics = await this.analyzeRulePerformance(ruleId, events);
      analytics.push(ruleAnalytics);
    }

    return analytics;
  }

  /**
   * Get integration analytics
   */
  async getIntegrationAnalytics(
    workflowType?: WorkflowType,
    timeRange?: { start: Date; end: Date }
  ): Promise<IntegrationAnalytics[]> {
    const integrationEvents = await Promise.all([
      this.eventStore.getEventsByType(WorkflowEventType.INTEGRATION_CALLED),
      this.eventStore.getEventsByType(WorkflowEventType.INTEGRATION_RESPONSE),
      this.eventStore.getEventsByType(WorkflowEventType.INTEGRATION_FAILED)
    ]);

    const allEvents = integrationEvents.flat();
    const integrationGroups = new Map<string, any[]>();

    allEvents.forEach(event => {
      const integrationName = event.eventData.integrationName;
      if (!integrationGroups.has(integrationName)) {
        integrationGroups.set(integrationName, []);
      }
      integrationGroups.get(integrationName)!.push(event);
    });

    const analytics: IntegrationAnalytics[] = [];

    for (const [integrationName, events] of integrationGroups) {
      const integrationAnalytics = await this.analyzeIntegrationPerformance(
        integrationName,
        events
      );
      analytics.push(integrationAnalytics);
    }

    return analytics;
  }

  /**
   * Get user analytics
   */
  async getUserAnalytics(
    workflowType?: WorkflowType,
    timeRange?: { start: Date; end: Date }
  ): Promise<UserAnalytics[]> {
    const userEvents = await this.eventStore.getEventsByType(
      WorkflowEventType.USER_ACTION
    );

    const userGroups = new Map<string, any[]>();

    userEvents.forEach(event => {
      const userId = event.userId;
      if (userId) {
        if (!userGroups.has(userId)) {
          userGroups.set(userId, []);
        }
        userGroups.get(userId)!.push(event);
      }
    });

    const analytics: UserAnalytics[] = [];

    for (const [userId, events] of userGroups) {
      const userAnalytics = await this.analyzeUserPerformance(userId, events);
      analytics.push(userAnalytics);
    }

    return analytics;
  }

  /**
   * Get trend analysis
   */
  async getTrendAnalysis(
    workflowType?: WorkflowType,
    timeRange?: { start: Date; end: Date }
  ): Promise<TrendAnalysis[]> {
    const trends: TrendAnalysis[] = [];

    // Analyze completion time trends
    const completionTimeTrend = await this.analyzeMetricTrend(
      'average_completion_time',
      timeRange
    );
    trends.push(completionTimeTrend);

    // Analyze throughput trends
    const throughputTrend = await this.analyzeMetricTrend(
      'throughput',
      timeRange
    );
    trends.push(throughputTrend);

    // Analyze success rate trends
    const successRateTrend = await this.analyzeMetricTrend(
      'success_rate',
      timeRange
    );
    trends.push(successRateTrend);

    return trends;
  }

  /**
   * Get bottleneck analysis
   */
  async getBottleneckAnalysis(
    workflowType?: WorkflowType,
    timeRange?: { start: Date; end: Date }
  ): Promise<BottleneckAnalysis[]> {
    const bottlenecks: BottleneckAnalysis[] = [];

    // Analyze step bottlenecks
    const stepBottlenecks = await this.analyzeStepBottlenecks(timeRange);
    bottlenecks.push(...stepBottlenecks);

    // Analyze integration bottlenecks
    const integrationBottlenecks = await this.analyzeIntegrationBottlenecks(timeRange);
    bottlenecks.push(...integrationBottlenecks);

    // Analyze assignment bottlenecks
    const assignmentBottlenecks = await this.analyzeAssignmentBottlenecks(timeRange);
    bottlenecks.push(...assignmentBottlenecks);

    return bottlenecks.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Generate actionable recommendations
   */
  private async generateRecommendations(
    performance: PerformanceMetrics,
    stepAnalytics: StepAnalytics[],
    bottlenecks: BottleneckAnalysis[]
  ): Promise<AnalyticsRecommendation[]> {
    const recommendations: AnalyticsRecommendation[] = [];

    // Performance recommendations
    if (performance.successRate < 95) {
      recommendations.push({
        type: 'quality',
        priority: 'high',
        title: 'Improve Workflow Success Rate',
        description: `Current success rate is ${performance.successRate.toFixed(1)}%. Consider reviewing failed workflows and implementing additional error handling.`,
        expectedImpact: 'Increase success rate by 5-10%',
        implementationComplexity: 'medium',
        actions: [
          'Analyze common failure patterns',
          'Implement retry mechanisms',
          'Add validation steps',
          'Improve error messaging'
        ]
      });
    }

    // Bottleneck recommendations
    bottlenecks.filter(b => b.severity === 'high').forEach(bottleneck => {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        title: `Address ${bottleneck.type} Bottleneck`,
        description: `${bottleneck.name} is causing significant delays affecting ${bottleneck.impact.affectedWorkflows} workflows.`,
        expectedImpact: `Reduce average delay by ${bottleneck.impact.averageDelay} minutes`,
        implementationComplexity: 'medium',
        actions: bottleneck.recommendedActions
      });
    });

    // Efficiency recommendations
    const slowSteps = stepAnalytics
      .filter(step => step.averageExecutionTime > 300) // 5 minutes
      .slice(0, 3);

    if (slowSteps.length > 0) {
      recommendations.push({
        type: 'efficiency',
        priority: 'medium',
        title: 'Optimize Slow-Running Steps',
        description: 'Several workflow steps are taking longer than expected to complete.',
        expectedImpact: 'Reduce overall completion time by 10-20%',
        implementationComplexity: 'low',
        actions: [
          'Review step logic for optimization opportunities',
          'Implement caching where appropriate',
          'Consider parallel execution',
          'Add performance monitoring'
        ]
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  // Helper methods
  private setupEventSubscriptions(): void {
    this.eventStore.subscribe('*', (event: BaseWorkflowEvent) => {
      this.processEventForAnalytics(event);
    });
  }

  private setupDefaultAlertThresholds(): void {
    this.alertThresholds.set('success_rate_low', 90);
    this.alertThresholds.set('average_completion_time_high', 240); // 4 hours
    this.alertThresholds.set('sla_breach_rate_high', 5);
    this.alertThresholds.set('error_rate_high', 10);
  }

  private async processEventForAnalytics(event: BaseWorkflowEvent): Promise<void> {
    // Real-time metric calculation and alerting
    try {
      await this.updateRealTimeMetrics(event);
      await this.checkAlertThresholds(event);
    } catch (error) {
      logger.error('Error processing event for analytics', {
        eventId: event.id,
        eventType: event.eventType,
        error: (error as Error).message
      });
    }
  }

  private async updateRealTimeMetrics(event: BaseWorkflowEvent): Promise<void> {
    // Update relevant metrics based on event type
    const metric: Partial<WorkflowMetric> = {
      id: `${event.id}_metric`,
      metricName: this.getMetricNameForEvent(event.eventType),
      metricValue: 1,
      unit: 'count',
      dimensions: {
        eventType: event.eventType,
        source: event.source,
        workflowId: event.workflowInstanceId
      },
      timestamp: event.timestamp,
      period: 'real_time'
    };

    // Store metric in database
    await this.storeMetric(metric as WorkflowMetric);
  }

  private async checkAlertThresholds(event: BaseWorkflowEvent): Promise<void> {
    // Check if any thresholds are exceeded and emit alerts
    if (event.eventType === WorkflowEventType.SLA_BREACHED) {
      this.emit('alert', {
        type: 'sla_breach',
        severity: 'high',
        workflowId: event.workflowInstanceId,
        message: 'SLA threshold breached',
        timestamp: event.timestamp
      });
    }
  }

  private getMetricNameForEvent(eventType: WorkflowEventType): string {
    const metricMapping: Record<WorkflowEventType, string> = {
      [WorkflowEventType.WORKFLOW_STARTED]: 'workflow_started_count',
      [WorkflowEventType.WORKFLOW_COMPLETED]: 'workflow_completed_count',
      [WorkflowEventType.WORKFLOW_FAILED]: 'workflow_failed_count',
      [WorkflowEventType.STEP_STARTED]: 'step_started_count',
      [WorkflowEventType.STEP_COMPLETED]: 'step_completed_count',
      [WorkflowEventType.STEP_FAILED]: 'step_failed_count',
      [WorkflowEventType.DECISION_MADE]: 'decision_made_count',
      [WorkflowEventType.SLA_BREACHED]: 'sla_breach_count',
      [WorkflowEventType.INTEGRATION_FAILED]: 'integration_failure_count'
    } as any;

    return metricMapping[eventType] || 'unknown_event_count';
  }

  private async storeMetric(metric: WorkflowMetric): Promise<void> {
    // Store in database and update cache
    await workflowRepository.createWorkflowMetric({
      workflowId: metric.dimensions.workflowId,
      metricName: metric.metricName,
      metricValue: metric.metricValue,
      dimensions: metric.dimensions,
      timestamp: metric.timestamp
    });
  }

  // Placeholder implementations for complex analysis methods
  private async getCompletionTimes(whereClause: any): Promise<{ average: number; median: number }> {
    // Implementation would calculate actual completion times
    return { average: 120, median: 95 }; // minutes
  }

  private async getSLABreaches(whereClause: any): Promise<number> {
    // Implementation would count SLA breaches
    return 5;
  }

  private async getEscalationCount(whereClause: any): Promise<number> {
    // Implementation would count escalations
    return 12;
  }

  private calculateThroughput(totalWorkflows: number, start: Date, end: Date): number {
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return totalWorkflows / hours;
  }

  private async analyzeStepPerformance(stepId: string, events: any[]): Promise<StepAnalytics> {
    // Placeholder implementation
    return {
      stepId,
      stepName: `Step ${stepId}`,
      stepType: 'task',
      executionCount: events.length,
      averageExecutionTime: 45,
      successRate: 95.5,
      failureRate: 4.5,
      mostCommonErrors: [],
      assignmentMetrics: {
        totalAssignments: events.length,
        averageAssignmentTime: 30,
        reassignmentRate: 2.1,
        escalationRate: 1.5,
        workloadDistribution: {}
      }
    };
  }

  private async analyzeRulePerformance(ruleId: string, events: any[]): Promise<RuleAnalytics> {
    // Placeholder implementation
    return {
      ruleId,
      ruleName: `Rule ${ruleId}`,
      category: 'medical_necessity',
      evaluationCount: events.length,
      matchRate: 75.5,
      averageConfidence: 0.85,
      impactMetrics: {
        approvalsInfluenced: 45,
        denialsInfluenced: 12,
        escalationsTriggered: 3
      }
    };
  }

  private async analyzeIntegrationPerformance(integrationName: string, events: any[]): Promise<IntegrationAnalytics> {
    // Placeholder implementation
    return {
      integrationName,
      integrationType: 'ehr',
      requestCount: events.length,
      successRate: 98.2,
      averageResponseTime: 1.5, // seconds
      errorRate: 1.8,
      mostCommonErrors: [],
      throughput: 100 // requests per hour
    };
  }

  private async analyzeUserPerformance(userId: string, events: any[]): Promise<UserAnalytics> {
    // Placeholder implementation
    return {
      userId,
      userName: `User ${userId}`,
      role: 'reviewer',
      tasksCompleted: events.length,
      averageTaskTime: 25, // minutes
      decisionAccuracy: 94.5,
      workloadMetrics: {
        currentAssignments: 5,
        overdueAssignments: 1,
        escalatedTasks: 2
      }
    };
  }

  private async analyzeMetricTrend(metricName: string, timeRange?: { start: Date; end: Date }): Promise<TrendAnalysis> {
    // Placeholder implementation
    return {
      metric: metricName,
      trend: 'improving' as any,
      changePercent: 5.2,
      timeframe: '7 days',
      significance: 'medium'
    };
  }

  private async analyzeStepBottlenecks(timeRange?: { start: Date; end: Date }): Promise<BottleneckAnalysis[]> {
    // Placeholder implementation
    return [];
  }

  private async analyzeIntegrationBottlenecks(timeRange?: { start: Date; end: Date }): Promise<BottleneckAnalysis[]> {
    // Placeholder implementation
    return [];
  }

  private async analyzeAssignmentBottlenecks(timeRange?: { start: Date; end: Date }): Promise<BottleneckAnalysis[]> {
    // Placeholder implementation
    return [];
  }
}

export const workflowAnalyticsEngine = new WorkflowAnalyticsEngine(
  new PrismaClient(),
  new PostgreSQLEventStore(new PrismaClient())
);