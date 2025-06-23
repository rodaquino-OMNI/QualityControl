/**
 * Business Rules Engine for Healthcare Workflow Automation
 * Evaluates complex healthcare business rules for authorization decisions
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { 
  Condition, 
  CompositeCondition, 
  ConditionOperator, 
  ActionType 
} from '../types/workflow-definitions';

// Rule definition interfaces
export interface BusinessRule {
  id: string;
  name: string;
  category: RuleCategory;
  priority: number;
  status: 'active' | 'inactive' | 'draft';
  effectiveDate: Date;
  expirationDate?: Date;
  version: string;
  
  // Rule Logic
  conditions: RuleCondition;
  actions: RuleAction[];
  
  // Metadata
  description?: string;
  tags: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum RuleCategory {
  MEDICAL_NECESSITY = 'medical_necessity',
  ELIGIBILITY = 'eligibility',
  PROVIDER_NETWORK = 'provider_network',
  COST_MANAGEMENT = 'cost_management',
  FRAUD_DETECTION = 'fraud_detection',
  COMPLIANCE = 'compliance',
  WORKFLOW_ROUTING = 'workflow_routing',
  AUTHORIZATION_LIMITS = 'authorization_limits',
  CLINICAL_GUIDELINES = 'clinical_guidelines',
  QUALITY_MEASURES = 'quality_measures'
}

export interface RuleCondition {
  type: 'simple' | 'composite';
  operator?: 'AND' | 'OR' | 'NOT';
  conditions?: RuleCondition[];
  field?: string;
  conditionOperator?: ConditionOperator;
  value?: any;
  dataType?: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
}

export interface RuleAction {
  type: ActionType;
  parameters: Record<string, any>;
  conditions?: RuleCondition[];
  priority: number;
}

export interface RuleContext {
  // Patient Context
  patient?: {
    id: string;
    age: number;
    gender: string;
    chronicConditions: string[];
    riskCategory: string;
    priorAuthorizations: any[];
    claimsHistory: any[];
  };
  
  // Provider Context
  provider?: {
    id: string;
    npi: string;
    specialty: string;
    networkStatus: string;
    credentialing: any;
    performanceMetrics: any;
    fraudHistory: any[];
  };
  
  // Procedure Context
  procedure?: {
    code: string;
    description: string;
    category: string;
    riskLevel: string;
    typicalCost: number;
    requiresPreauth: boolean;
    clinicalGuidelines: any[];
  };
  
  // Authorization Context
  authorization?: {
    requestType: string;
    urgencyLevel: string;
    serviceDate: Date;
    estimatedCost: number;
    clinicalJustification: string;
    supportingDocuments: any[];
  };
  
  // Insurance Context
  insurance?: {
    planType: string;
    benefitLevel: string;
    copayAmount: number;
    deductibleMet: boolean;
    annualLimit: number;
    usedBenefits: number;
  };
  
  // Environmental Context
  environment?: {
    businessHours: boolean;
    currentDate: Date;
    region: string;
    regulatoryRequirements: string[];
  };
  
  // Workflow Context
  workflow?: {
    instanceId: string;
    currentStep: string;
    previousDecisions: any[];
    escalationLevel: number;
    timeInWorkflow: number;
  };
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  matched: boolean;
  confidence: number;
  executionTime: number;
  actions: RuleAction[];
  explanation: string;
  metadata: Record<string, any>;
}

export interface RuleSetEvaluationResult {
  success: boolean;
  totalRules: number;
  matchedRules: number;
  executionTime: number;
  results: RuleEvaluationResult[];
  consolidatedActions: RuleAction[];
  recommendation: string;
  confidence: number;
}

export class BusinessRulesEngine extends EventEmitter {
  private prisma: PrismaClient;
  private ruleCache: Map<string, BusinessRule[]> = new Map();
  private lastCacheUpdate: Date = new Date(0);
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
  }

  /**
   * Evaluate rules for a given category and context
   */
  async evaluateRules(
    category: RuleCategory,
    context: RuleContext,
    options: {
      includeInactive?: boolean;
      maxExecutionTime?: number;
      shortCircuit?: boolean;
    } = {}
  ): Promise<RuleSetEvaluationResult> {
    const startTime = Date.now();
    
    try {
      // Get applicable rules
      const rules = await this.getApplicableRules(category, options.includeInactive);
      
      // Evaluate each rule
      const results: RuleEvaluationResult[] = [];
      let matchedRules = 0;
      
      for (const rule of rules) {
        const ruleResult = await this.evaluateRule(rule, context);
        results.push(ruleResult);
        
        if (ruleResult.matched) {
          matchedRules++;
          
          // Short circuit if requested and high confidence match
          if (options.shortCircuit && ruleResult.confidence > 0.9) {
            break;
          }
        }
        
        // Check execution time limit
        if (options.maxExecutionTime && (Date.now() - startTime) > options.maxExecutionTime) {
          logger.warn('Rule evaluation timeout reached', {
            category,
            rulesEvaluated: results.length,
            totalRules: rules.length
          });
          break;
        }
      }
      
      // Consolidate actions and generate recommendation
      const consolidatedActions = this.consolidateActions(results);
      const recommendation = this.generateRecommendation(results, context);
      const confidence = this.calculateOverallConfidence(results);
      
      const evaluationResult: RuleSetEvaluationResult = {
        success: true,
        totalRules: rules.length,
        matchedRules,
        executionTime: Date.now() - startTime,
        results,
        consolidatedActions,
        recommendation,
        confidence
      };
      
      // Emit evaluation event
      this.emit('ruleSetEvaluated', {
        category,
        result: evaluationResult,
        context
      });
      
      return evaluationResult;
      
    } catch (error) {
      logger.error('Rule evaluation failed', {
        category,
        error: (error as Error).message,
        executionTime: Date.now() - startTime
      });
      
      return {
        success: false,
        totalRules: 0,
        matchedRules: 0,
        executionTime: Date.now() - startTime,
        results: [],
        consolidatedActions: [],
        recommendation: 'Error occurred during rule evaluation',
        confidence: 0
      };
    }
  }

  /**
   * Evaluate a single rule against context
   */
  async evaluateRule(rule: BusinessRule, context: RuleContext): Promise<RuleEvaluationResult> {
    const startTime = Date.now();
    
    try {
      // Check if rule is active and within effective dates
      if (!this.isRuleApplicable(rule, new Date())) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          matched: false,
          confidence: 0,
          executionTime: 0,
          actions: [],
          explanation: 'Rule not applicable (inactive or outside effective dates)',
          metadata: {}
        };
      }
      
      // Evaluate rule conditions
      const conditionResult = this.evaluateCondition(rule.conditions, context);
      
      // Filter applicable actions
      const applicableActions = rule.actions.filter(action => {
        if (!action.conditions || action.conditions.length === 0) return true;
        // Evaluate all conditions for the action (assuming AND logic)
        return action.conditions.every(condition => 
          this.evaluateCondition(condition, context).matched
        );
      });
      
      const result: RuleEvaluationResult = {
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        matched: conditionResult.matched,
        confidence: conditionResult.confidence,
        executionTime: Date.now() - startTime,
        actions: conditionResult.matched ? applicableActions : [],
        explanation: conditionResult.explanation,
        metadata: {
          priority: rule.priority,
          version: rule.version,
          tags: rule.tags
        }
      };
      
      // Emit rule evaluation event
      this.emit('ruleEvaluated', {
        rule,
        result,
        context
      });
      
      return result;
      
    } catch (error) {
      logger.error('Single rule evaluation failed', {
        ruleId: rule.id,
        ruleName: rule.name,
        error: (error as Error).message
      });
      
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        matched: false,
        confidence: 0,
        executionTime: Date.now() - startTime,
        actions: [],
        explanation: `Evaluation error: ${(error as Error).message}`,
        metadata: {}
      };
    }
  }

  /**
   * Evaluate a condition (simple or composite)
   */
  private evaluateCondition(condition: RuleCondition, context: RuleContext): {
    matched: boolean;
    confidence: number;
    explanation: string;
  } {
    if (condition.type === 'simple') {
      return this.evaluateSimpleCondition(condition, context);
    } else {
      return this.evaluateCompositeCondition(condition, context);
    }
  }

  /**
   * Evaluate a simple condition
   */
  private evaluateSimpleCondition(condition: RuleCondition, context: RuleContext): {
    matched: boolean;
    confidence: number;
    explanation: string;
  } {
    if (!condition.field || !condition.conditionOperator || condition.value === undefined) {
      return {
        matched: false,
        confidence: 0,
        explanation: 'Invalid condition: missing field, operator, or value'
      };
    }
    
    const fieldValue = this.getFieldValue(condition.field, context);
    const matched = this.evaluateOperator(
      fieldValue, 
      condition.conditionOperator, 
      condition.value, 
      condition.dataType
    );
    
    return {
      matched,
      confidence: matched ? 1.0 : 0.0,
      explanation: `${condition.field} ${condition.conditionOperator} ${condition.value} = ${matched}`
    };
  }

  /**
   * Evaluate a composite condition (AND, OR, NOT)
   */
  private evaluateCompositeCondition(condition: RuleCondition, context: RuleContext): {
    matched: boolean;
    confidence: number;
    explanation: string;
  } {
    if (!condition.conditions || condition.conditions.length === 0) {
      return {
        matched: false,
        confidence: 0,
        explanation: 'No sub-conditions provided'
      };
    }
    
    const subResults = condition.conditions.map(subCondition => 
      this.evaluateCondition(subCondition, context)
    );
    
    let matched: boolean;
    let confidence: number;
    let explanation: string;
    
    switch (condition.operator) {
      case 'AND':
        matched = subResults.every(result => result.matched);
        confidence = matched ? Math.min(...subResults.map(r => r.confidence)) : 0;
        explanation = `AND(${subResults.map(r => r.explanation).join(', ')})`;
        break;
        
      case 'OR':
        matched = subResults.some(result => result.matched);
        confidence = matched ? Math.max(...subResults.map(r => r.confidence)) : 0;
        explanation = `OR(${subResults.map(r => r.explanation).join(', ')})`;
        break;
        
      case 'NOT':
        if (subResults.length !== 1) {
          return {
            matched: false,
            confidence: 0,
            explanation: 'NOT operator requires exactly one sub-condition'
          };
        }
        matched = !subResults[0].matched;
        confidence = subResults[0].confidence;
        explanation = `NOT(${subResults[0].explanation})`;
        break;
        
      default:
        return {
          matched: false,
          confidence: 0,
          explanation: `Unknown operator: ${condition.operator}`
        };
    }
    
    return { matched, confidence, explanation };
  }

  /**
   * Evaluate operator against two values
   */
  private evaluateOperator(
    fieldValue: any, 
    operator: ConditionOperator, 
    compareValue: any, 
    dataType?: string
  ): boolean {
    // Handle null/undefined values
    if (fieldValue === null || fieldValue === undefined) {
      return operator === ConditionOperator.IS_NULL;
    }
    
    if (operator === ConditionOperator.IS_NOT_NULL) {
      return fieldValue !== null && fieldValue !== undefined;
    }
    
    // Type conversion based on dataType
    const { convertedFieldValue, convertedCompareValue } = this.convertValues(
      fieldValue, 
      compareValue, 
      dataType
    );
    
    switch (operator) {
      case ConditionOperator.EQUALS:
        return convertedFieldValue === convertedCompareValue;
        
      case ConditionOperator.NOT_EQUALS:
        return convertedFieldValue !== convertedCompareValue;
        
      case ConditionOperator.GREATER_THAN:
        return convertedFieldValue > convertedCompareValue;
        
      case ConditionOperator.LESS_THAN:
        return convertedFieldValue < convertedCompareValue;
        
      case ConditionOperator.GREATER_EQUAL:
        return convertedFieldValue >= convertedCompareValue;
        
      case ConditionOperator.LESS_EQUAL:
        return convertedFieldValue <= convertedCompareValue;
        
      case ConditionOperator.CONTAINS:
        return String(convertedFieldValue).includes(String(convertedCompareValue));
        
      case ConditionOperator.NOT_CONTAINS:
        return !String(convertedFieldValue).includes(String(convertedCompareValue));
        
      case ConditionOperator.IN:
        return Array.isArray(convertedCompareValue) && 
               convertedCompareValue.includes(convertedFieldValue);
        
      case ConditionOperator.NOT_IN:
        return !Array.isArray(convertedCompareValue) || 
               !convertedCompareValue.includes(convertedFieldValue);
        
      case ConditionOperator.REGEX_MATCH:
        try {
          const regex = new RegExp(String(convertedCompareValue));
          return regex.test(String(convertedFieldValue));
        } catch {
          return false;
        }
        
      case ConditionOperator.DATE_BEFORE:
        return new Date(convertedFieldValue) < new Date(convertedCompareValue);
        
      case ConditionOperator.DATE_AFTER:
        return new Date(convertedFieldValue) > new Date(convertedCompareValue);
        
      case ConditionOperator.AGE_GREATER:
        return this.calculateAge(convertedFieldValue) > convertedCompareValue;
        
      case ConditionOperator.AGE_LESS:
        return this.calculateAge(convertedFieldValue) < convertedCompareValue;
        
      default:
        return false;
    }
  }

  /**
   * Get field value from context using dot notation
   */
  private getFieldValue(fieldPath: string, context: RuleContext): any {
    const pathParts = fieldPath.split('.');
    let value: any = context;
    
    for (const part of pathParts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * Convert values to appropriate types for comparison
   */
  private convertValues(fieldValue: any, compareValue: any, dataType?: string): {
    convertedFieldValue: any;
    convertedCompareValue: any;
  } {
    if (!dataType) {
      return { convertedFieldValue: fieldValue, convertedCompareValue: compareValue };
    }
    
    switch (dataType) {
      case 'number':
        return {
          convertedFieldValue: Number(fieldValue),
          convertedCompareValue: Number(compareValue)
        };
        
      case 'boolean':
        return {
          convertedFieldValue: Boolean(fieldValue),
          convertedCompareValue: Boolean(compareValue)
        };
        
      case 'date':
        return {
          convertedFieldValue: new Date(fieldValue),
          convertedCompareValue: new Date(compareValue)
        };
        
      case 'string':
        return {
          convertedFieldValue: String(fieldValue),
          convertedCompareValue: String(compareValue)
        };
        
      default:
        return { convertedFieldValue: fieldValue, convertedCompareValue: compareValue };
    }
  }

  /**
   * Calculate age from birth date
   */
  private calculateAge(birthDate: any): number {
    const birth = new Date(birthDate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  }

  /**
   * Get applicable rules for a category
   */
  private async getApplicableRules(
    category: RuleCategory, 
    includeInactive: boolean = false
  ): Promise<BusinessRule[]> {
    const cacheKey = `${category}_${includeInactive}`;
    
    // Check cache
    if (this.shouldUseCache()) {
      const cached = this.ruleCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    
    // TODO: Implement rule storage mechanism
    // For now, return empty array as there's no businessRule model in the schema
    const businessRules: BusinessRule[] = [];
    
    // In a real implementation, you would:
    // 1. Store rules in a JSON column in a settings table
    // 2. Use a separate rules service/database
    // 3. Load rules from configuration files
    logger.warn('BusinessRule model not found in schema. Returning empty rules array.', {
      category,
      includeInactive
    });
    
    // Cache results
    this.ruleCache.set(cacheKey, businessRules);
    this.lastCacheUpdate = new Date();
    
    return businessRules;
  }

  /**
   * Check if rule is applicable based on status and dates
   */
  private isRuleApplicable(rule: BusinessRule, currentDate: Date): boolean {
    if (rule.status !== 'active') {
      return false;
    }
    
    if (rule.effectiveDate > currentDate) {
      return false;
    }
    
    if (rule.expirationDate && rule.expirationDate < currentDate) {
      return false;
    }
    
    return true;
  }

  /**
   * Consolidate actions from multiple rule results
   */
  private consolidateActions(results: RuleEvaluationResult[]): RuleAction[] {
    const actionMap = new Map<string, RuleAction>();
    
    // Collect all actions from matched rules
    results
      .filter(result => result.matched)
      .forEach(result => {
        result.actions.forEach(action => {
          const key = `${action.type}_${JSON.stringify(action.parameters)}`;
          
          // Keep action with highest priority
          if (!actionMap.has(key) || actionMap.get(key)!.priority > action.priority) {
            actionMap.set(key, action);
          }
        });
      });
    
    // Sort by priority
    return Array.from(actionMap.values()).sort((a, b) => a.priority - b.priority);
  }

  /**
   * Generate recommendation based on rule results
   */
  private generateRecommendation(results: RuleEvaluationResult[], context: RuleContext): string {
    const matchedResults = results.filter(r => r.matched);
    
    if (matchedResults.length === 0) {
      return 'No applicable rules matched. Manual review may be required.';
    }
    
    const actions = this.consolidateActions(results);
    const primaryAction = actions[0];
    
    if (!primaryAction) {
      return 'Rules matched but no clear action determined. Manual review recommended.';
    }
    
    const actionDescriptions: Record<ActionType, string> = {
      [ActionType.APPROVE]: 'Approve the authorization request',
      [ActionType.DENY]: 'Deny the authorization request',
      [ActionType.PEND]: 'Pend the request for additional review',
      [ActionType.REQUEST_INFO]: 'Request additional information',
      [ActionType.ESCALATE]: 'Escalate to higher authority',
      [ActionType.ASSIGN]: 'Assign to specific reviewer',
      [ActionType.NOTIFY]: 'Send notification',
      [ActionType.INTEGRATE]: 'Trigger integration',
      [ActionType.CALCULATE]: 'Perform calculation',
      [ActionType.VALIDATE]: 'Perform validation',
      [ActionType.TRANSFORM]: 'Transform data',
      [ActionType.DELAY]: 'Add delay'
    };
    
    return actionDescriptions[primaryAction.type] || 'Execute determined action';
  }

  /**
   * Calculate overall confidence from rule results
   */
  private calculateOverallConfidence(results: RuleEvaluationResult[]): number {
    const matchedResults = results.filter(r => r.matched);
    
    if (matchedResults.length === 0) {
      return 0;
    }
    
    // Weight confidence by rule priority and category
    const weightedConfidences = matchedResults.map(result => {
      const priorityWeight = 1 / (result.metadata.priority || 1);
      return result.confidence * priorityWeight;
    });
    
    const totalWeight = matchedResults.length;
    const weightedSum = weightedConfidences.reduce((sum, conf) => sum + conf, 0);
    
    return Math.min(weightedSum / totalWeight, 1.0);
  }

  /**
   * Check if cache should be used
   */
  private shouldUseCache(): boolean {
    return (Date.now() - this.lastCacheUpdate.getTime()) < this.cacheTimeout;
  }

  /**
   * Clear rule cache
   */
  clearCache(): void {
    this.ruleCache.clear();
    this.lastCacheUpdate = new Date(0);
  }

  /**
   * Add a new rule
   */
  async addRule(rule: Omit<BusinessRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<BusinessRule> {
    // TODO: Implement rule storage mechanism
    const newRule: BusinessRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Store in cache for now
    const cacheKey = `${rule.category}_false`;
    const cached = this.ruleCache.get(cacheKey) || [];
    cached.push(newRule);
    this.ruleCache.set(cacheKey, cached);
    
    logger.info('Rule added to memory cache', { ruleId: newRule.id, category: rule.category });
    
    return newRule;
  }

  /**
   * Update an existing rule
   */
  async updateRule(id: string, updates: Partial<BusinessRule>): Promise<BusinessRule> {
    // TODO: Implement rule storage mechanism
    logger.warn('Rule update not implemented without database model', { id, updates });
    
    // For now, throw an error
    throw new Error('BusinessRule model not found in schema. Cannot update rules.');
  }

  /**
   * Delete a rule
   */
  async deleteRule(id: string): Promise<void> {
    // TODO: Implement rule storage mechanism
    logger.warn('Rule deletion not implemented without database model', { id });
    
    // Clear cache to ensure consistency
    this.clearCache();
  }
}

export const businessRulesEngine = new BusinessRulesEngine(new PrismaClient());