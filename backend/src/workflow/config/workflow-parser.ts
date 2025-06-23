/**
 * Workflow Definition Parser and Validator
 * Converts DSL configurations to executable workflow definitions
 */

const Ajv = require('ajv').default || require('ajv');
import addFormats from 'ajv-formats';
import { 
  WorkflowDefinition, 
  WorkflowDSL, 
  WorkflowValidationResult, 
  WorkflowValidationError,
  WorkflowType,
  WorkflowStatus,
  StepType,
  Duration,
  WorkflowStep,
  WorkflowVariable,
  IntegrationConfig,
  SLAConfiguration,
  ComplianceRequirement
} from '../types/workflow-definitions';

// JSON Schema for Workflow DSL validation
const workflowSchema = {
  type: 'object',
  required: ['workflow', 'steps', 'start'],
  properties: {
    workflow: {
      type: 'object',
      required: ['name', 'version', 'type'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 255 },
        version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
        type: { 
          type: 'string', 
          enum: Object.values(WorkflowType) 
        },
        description: { type: 'string', maxLength: 1000 }
      }
    },
    variables: {
      type: 'object',
      patternProperties: {
        '^[a-zA-Z_][a-zA-Z0-9_]*$': {
          type: 'object',
          required: ['type'],
          properties: {
            type: { 
              type: 'string', 
              enum: ['string', 'number', 'boolean', 'date', 'object', 'array'] 
            },
            default: {},
            required: { type: 'boolean' },
            description: { type: 'string' }
          }
        }
      }
    },
    steps: {
      type: 'object',
      minProperties: 1,
      patternProperties: {
        '^[a-zA-Z_][a-zA-Z0-9_]*$': {
          type: 'object',
          required: ['type'],
          properties: {
            type: { 
              type: 'string', 
              enum: Object.values(StepType) 
            },
            name: { type: 'string' },
            description: { type: 'string' },
            executor: { type: 'string' },
            input: { type: 'object' },
            output: { 
              type: 'array', 
              items: { type: 'string' } 
            },
            when: {},
            timeout: { type: 'string' },
            retry: {
              type: 'object',
              properties: {
                attempts: { type: 'integer', minimum: 1, maximum: 10 },
                delay: { type: 'string' }
              }
            },
            on: {
              type: 'object',
              properties: {
                success: { 
                  oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } }
                  ]
                },
                failure: { 
                  oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } }
                  ]
                },
                timeout: { 
                  oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } }
                  ]
                }
              }
            }
          }
        }
      }
    },
    start: { type: 'string' },
    sla: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        warning: { type: 'string' },
        critical: { type: 'string' }
      }
    },
    compliance: {
      type: 'array',
      items: { type: 'string' }
    },
    integrations: {
      type: 'object',
      patternProperties: {
        '^[a-zA-Z_][a-zA-Z0-9_]*$': {
          type: 'object',
          required: ['type', 'endpoint'],
          properties: {
            type: { 
              type: 'string', 
              enum: ['ehr', 'payer', 'provider', 'clearinghouse', 'api', 'database'] 
            },
            endpoint: { type: 'string', format: 'uri' },
            method: { 
              type: 'string', 
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] 
            },
            auth: { type: 'object' },
            mapping: { type: 'object' }
          }
        }
      }
    }
  }
};

export class WorkflowParser {
  private ajv: any;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
  }

  /**
   * Parse and validate a workflow DSL configuration
   */
  async parseWorkflow(
    dslConfig: WorkflowDSL, 
    userId: string
  ): Promise<{ definition: WorkflowDefinition; validation: WorkflowValidationResult }> {
    // Validate DSL structure
    const validation = this.validateDSL(dslConfig);
    
    if (!validation.isValid) {
      throw new Error(`Invalid workflow configuration: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Convert DSL to WorkflowDefinition
    const definition = await this.convertDSLToDefinition(dslConfig, userId);
    
    // Perform business logic validation
    const businessValidation = this.validateBusinessLogic(definition);
    validation.errors.push(...businessValidation.errors);
    validation.warnings.push(...businessValidation.warnings);
    
    return { definition, validation };
  }

  /**
   * Validate DSL structure against JSON schema
   */
  private validateDSL(dslConfig: WorkflowDSL): WorkflowValidationResult {
    const validate = this.ajv.compile(workflowSchema);
    const isValid = validate(dslConfig);
    
    const errors: WorkflowValidationError[] = [];
    const warnings: WorkflowValidationError[] = [];

    if (!isValid && validate.errors) {
      for (const error of validate.errors) {
        errors.push({
          path: error.instancePath || error.schemaPath,
          message: error.message || 'Validation error',
          code: error.keyword || 'VALIDATION_ERROR',
          severity: 'error'
        });
      }
    }

    return {
      isValid,
      errors,
      warnings
    };
  }

  /**
   * Convert DSL configuration to WorkflowDefinition
   */
  private async convertDSLToDefinition(
    dslConfig: WorkflowDSL, 
    userId: string
  ): Promise<WorkflowDefinition> {
    const now = new Date();
    
    return {
      id: '', // Will be generated by database
      name: dslConfig.workflow.name,
      description: dslConfig.workflow.description,
      version: dslConfig.workflow.version,
      type: dslConfig.workflow.type as WorkflowType,
      status: WorkflowStatus.DRAFT,
      
      // Convert variables
      variables: this.convertVariables(dslConfig.variables || {}),
      
      // Convert steps
      steps: this.convertSteps(dslConfig.steps),
      startStep: dslConfig.start,
      endSteps: this.findEndSteps(dslConfig.steps),
      
      // Business configuration
      businessRules: [], // Will be populated separately
      integrations: this.convertIntegrations(dslConfig.integrations || {}),
      sla: this.convertSLA(dslConfig.sla),
      compliance: this.convertCompliance(dslConfig.compliance || []),
      
      // Technical configuration
      concurrency: {
        maxInstances: 100, // Default value
        parallelSteps: true,
        timeout: { value: 24, unit: 'hours' }
      },
      
      // Audit and monitoring
      auditLevel: 'standard',
      monitoring: {
        enabled: true,
        metrics: ['duration', 'success_rate', 'error_rate'],
        alerts: ['sla_breach', 'high_error_rate']
      },
      
      // Metadata
      tags: [],
      category: this.inferCategory(dslConfig.workflow.type as WorkflowType),
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Convert DSL variables to WorkflowVariable objects
   */
  private convertVariables(variables: Record<string, any>): WorkflowVariable[] {
    return Object.entries(variables).map(([name, config]) => ({
      name,
      type: config.type,
      defaultValue: config.default,
      required: config.required || false,
      description: config.description
    }));
  }

  /**
   * Convert DSL steps to WorkflowStep objects
   */
  private convertSteps(steps: Record<string, any>): WorkflowStep[] {
    return Object.entries(steps).map(([stepId, stepConfig]) => ({
      id: stepId,
      name: stepConfig.name || stepId,
      description: stepConfig.description,
      type: stepConfig.type as StepType,
      executor: stepConfig.executor || this.getDefaultExecutor(stepConfig.type),
      inputVariables: Object.keys(stepConfig.input || {}),
      outputVariables: stepConfig.output || [],
      conditions: stepConfig.when ? [this.parseCondition(stepConfig.when)] : [],
      actions: [], // Will be populated based on step type
      timeout: stepConfig.timeout ? this.parseDuration(stepConfig.timeout) : undefined,
      escalation: [],
      nextSteps: this.extractNextSteps(stepConfig.on),
      errorHandling: {
        onError: 'fail',
        fallbackStep: stepConfig.on?.failure,
        errorMapping: {}
      },
      assignmentRules: [],
      metadata: {
        retry: stepConfig.retry
      }
    }));
  }

  /**
   * Convert DSL integrations to IntegrationConfig objects
   */
  private convertIntegrations(integrations: Record<string, any>): IntegrationConfig[] {
    return Object.entries(integrations).map(([integrationId, config]) => ({
      id: integrationId,
      name: integrationId,
      type: config.type,
      endpoint: config.endpoint,
      method: config.method || 'POST',
      headers: {},
      timeout: { value: 30, unit: 'seconds' },
      retryPolicy: {
        maxAttempts: 3,
        backoffType: 'exponential',
        initialDelay: { value: 1, unit: 'seconds' },
        retryConditions: ['timeout', 'server_error']
      },
      authentication: this.convertAuthentication(config.auth),
      dataMapping: this.convertDataMapping(config.mapping || {}),
      responseMapping: [],
      errorHandling: {
        onError: 'fail',
        errorMapping: {}
      }
    }));
  }

  /**
   * Convert DSL SLA configuration
   */
  private convertSLA(slaConfig?: any): SLAConfiguration {
    if (!slaConfig) {
      return {
        target: { value: 2, unit: 'hours' },
        warning: { value: 1, unit: 'hours' },
        critical: { value: 4, unit: 'hours' },
        escalations: []
      };
    }

    return {
      target: this.parseDuration(slaConfig.target),
      warning: this.parseDuration(slaConfig.warning),
      critical: this.parseDuration(slaConfig.critical),
      escalations: []
    };
  }

  /**
   * Convert compliance requirements
   */
  private convertCompliance(complianceList: string[]): ComplianceRequirement[] {
    return complianceList.map(requirement => ({
      id: requirement.toLowerCase().replace(/\s+/g, '_'),
      name: requirement,
      regulation: this.mapRegulation(requirement),
      requirement,
      controls: [],
      auditRequired: true
    }));
  }

  /**
   * Validate business logic rules
   */
  private validateBusinessLogic(definition: WorkflowDefinition): WorkflowValidationResult {
    const errors: WorkflowValidationError[] = [];
    const warnings: WorkflowValidationError[] = [];

    // Validate step references
    const stepIds = definition.steps.map(s => s.id);
    
    // Check start step exists
    if (!stepIds.includes(definition.startStep)) {
      errors.push({
        path: 'startStep',
        message: `Start step '${definition.startStep}' does not exist`,
        code: 'INVALID_START_STEP',
        severity: 'error'
      });
    }

    // Check step connections
    definition.steps.forEach(step => {
      step.nextSteps.forEach(nextStepId => {
        if (!stepIds.includes(nextStepId)) {
          errors.push({
            path: `steps.${step.id}.nextSteps`,
            message: `Referenced step '${nextStepId}' does not exist`,
            code: 'INVALID_STEP_REFERENCE',
            severity: 'error'
          });
        }
      });
    });

    // Check for unreachable steps
    const reachableSteps = this.findReachableSteps(definition);
    stepIds.forEach(stepId => {
      if (!reachableSteps.has(stepId)) {
        warnings.push({
          path: `steps.${stepId}`,
          message: `Step '${stepId}' is unreachable`,
          code: 'UNREACHABLE_STEP',
          severity: 'warning'
        });
      }
    });

    // Check for circular dependencies
    const circularDeps = this.findCircularDependencies(definition);
    circularDeps.forEach(cycle => {
      errors.push({
        path: 'steps',
        message: `Circular dependency detected: ${cycle.join(' -> ')}`,
        code: 'CIRCULAR_DEPENDENCY',
        severity: 'error'
      });
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Helper methods
  private parseDuration(durationStr: string): Duration {
    const match = durationStr.match(/^(\d+)\s*(seconds?|minutes?|hours?|days?|weeks?|months?)$/i);
    if (!match) {
      throw new Error(`Invalid duration format: ${durationStr}`);
    }
    
    return {
      value: parseInt(match[1]),
      unit: match[2].toLowerCase().replace(/s$/, '') as any
    };
  }

  private parseCondition(conditionExpr: any): any {
    // Simple condition parsing - could be enhanced with expression parser
    return {
      id: 'condition_' + Date.now(),
      field: 'status',
      operator: 'equals',
      value: conditionExpr,
      dataType: 'string'
    };
  }

  private extractNextSteps(onConfig: any): string[] {
    if (!onConfig) return [];
    
    const nextSteps: string[] = [];
    
    if (onConfig.success) {
      if (Array.isArray(onConfig.success)) {
        nextSteps.push(...onConfig.success);
      } else {
        nextSteps.push(onConfig.success);
      }
    }
    
    return nextSteps;
  }

  private getDefaultExecutor(stepType: string): string {
    const executors: Record<string, string> = {
      task: 'TaskExecutor',
      decision: 'DecisionExecutor',
      integration: 'IntegrationExecutor',
      wait: 'WaitExecutor',
      parallel: 'ParallelExecutor',
      manual: 'ManualExecutor'
    };
    
    return executors[stepType] || 'DefaultExecutor';
  }

  private findEndSteps(steps: Record<string, any>): string[] {
    return Object.entries(steps)
      .filter(([_, stepConfig]) => !stepConfig.on?.success)
      .map(([stepId, _]) => stepId);
  }

  private convertAuthentication(authConfig: any): any {
    if (!authConfig) {
      return { type: 'none' };
    }
    
    return {
      type: authConfig.type || 'bearer',
      credentials: authConfig.credentials || {}
    };
  }

  private convertDataMapping(mappingConfig: Record<string, string>): any[] {
    return Object.entries(mappingConfig).map(([source, target]) => ({
      source,
      target,
      required: true
    }));
  }

  private mapRegulation(requirement: string): any {
    const regulationMap: Record<string, string> = {
      'hipaa': 'HIPAA',
      'gdpr': 'GDPR',
      'soc2': 'SOC2',
      'cms': 'CMS',
      'fda': 'FDA'
    };
    
    const key = requirement.toLowerCase();
    return regulationMap[key] || 'STATE';
  }

  private inferCategory(workflowType: WorkflowType): string {
    const categoryMap: Record<WorkflowType, string> = {
      [WorkflowType.PRIOR_AUTHORIZATION]: 'authorization',
      [WorkflowType.CLAIMS_PROCESSING]: 'claims',
      [WorkflowType.APPEAL_MANAGEMENT]: 'appeals',
      [WorkflowType.PROVIDER_CREDENTIALING]: 'credentialing',
      [WorkflowType.QUALITY_AUDIT]: 'audit',
      [WorkflowType.FRAUD_INVESTIGATION]: 'fraud',
      [WorkflowType.MEDICAL_REVIEW]: 'medical',
      [WorkflowType.BENEFIT_VERIFICATION]: 'benefits'
    };
    
    return categoryMap[workflowType] || 'general';
  }

  private findReachableSteps(definition: WorkflowDefinition): Set<string> {
    const reachable = new Set<string>();
    const visited = new Set<string>();
    
    const visit = (stepId: string) => {
      if (visited.has(stepId)) return;
      visited.add(stepId);
      reachable.add(stepId);
      
      const step = definition.steps.find(s => s.id === stepId);
      if (step) {
        step.nextSteps.forEach(nextStepId => visit(nextStepId));
      }
    };
    
    visit(definition.startStep);
    return reachable;
  }

  private findCircularDependencies(definition: WorkflowDefinition): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const dfs = (stepId: string, path: string[]): boolean => {
      if (recursionStack.has(stepId)) {
        const cycleStart = path.indexOf(stepId);
        cycles.push(path.slice(cycleStart).concat(stepId));
        return true;
      }
      
      if (visited.has(stepId)) return false;
      
      visited.add(stepId);
      recursionStack.add(stepId);
      
      const step = definition.steps.find(s => s.id === stepId);
      if (step) {
        for (const nextStepId of step.nextSteps) {
          if (dfs(nextStepId, [...path, stepId])) {
            break;
          }
        }
      }
      
      recursionStack.delete(stepId);
      return false;
    };
    
    definition.steps.forEach(step => {
      if (!visited.has(step.id)) {
        dfs(step.id, []);
      }
    });
    
    return cycles;
  }
}

export const workflowParser = new WorkflowParser();