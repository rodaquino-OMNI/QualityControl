/**
 * REST API Routes for Workflow Management and Execution
 * Provides comprehensive workflow automation endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';
import type { RuleCategory } from '../rules/business-rules-engine';
import '../../types/express';
const { body, query, param, validationResult } = require('express-validator');
import { PrismaClient } from '@prisma/client';
import { workflowRepository } from '../data/workflow-repository';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';
import { workflowParser } from '../config/workflow-parser';
import { businessRulesEngine } from '../rules/business-rules-engine';
import { workflowAnalyticsEngine } from '../analytics/workflow-analytics';
import { integrationManager } from '../integrations/integration-framework';
import { eventStore, WorkflowEventFactory, WorkflowAggregate, WorkflowEventType } from '../events/event-store';
import { 
  WorkflowDefinition, 
  WorkflowInstance, 
  WorkflowType, 
  WorkflowStatus,
  WorkflowDSL
} from '../types/workflow-definitions';

export function createWorkflowRoutes(prisma: PrismaClient): Router {
  const router = Router();

  // ========== Workflow Definition Management ==========

  /**
   * @swagger
   * /api/workflows/definitions:
   *   post:
   *     summary: Create a new workflow definition
   *     tags: [Workflow Definitions]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               dsl:
   *                 type: object
   *                 description: Workflow DSL configuration
   *     responses:
   *       201:
   *         description: Workflow definition created successfully
   *       400:
   *         description: Invalid workflow configuration
   */
  router.post(
    '/definitions',
    [
      body('dsl').isObject().withMessage('DSL configuration is required'),
      body('dsl.workflow').isObject().withMessage('Workflow metadata is required'),
      body('dsl.workflow.name').isString().withMessage('Workflow name is required'),
      body('dsl.workflow.version').isString().withMessage('Workflow version is required'),
      body('dsl.workflow.type').isString().withMessage('Workflow type is required'),
      body('dsl.steps').isObject().withMessage('Workflow steps are required'),
      body('dsl.start').isString().withMessage('Start step is required')
    ],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
        }

        const { dsl } = req.body;
        const userId = req.user?.id ?? 'system';

        // Parse and validate workflow DSL
        const { definition, validation } = await workflowParser.parseWorkflow(dsl, userId);

        if (!validation.isValid) {
          throw new AppError(
            'Invalid workflow configuration',
            400,
            'WORKFLOW_VALIDATION_ERROR',
            validation.errors
          );
        }

        // Store workflow definition using temporary repository
        const savedDefinition = {
          id: `workflow_${Date.now()}`,
          name: definition.name,
          version: definition.version,
          type: definition.type,
          definition: definition,
          status: 'active',
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // TODO: Replace with actual Prisma query when workflow models are added:
        // const savedDefinition = await prisma.workflowDefinition.create({
        //   data: {
        //     name: definition.name,
        //     version: definition.version,
        //     type: definition.type,
        //     definition: definition as any,
        //     status: 'active',
        //     createdBy: userId
        //   }
        // });

        logger.info('Workflow definition created', {
          definitionId: savedDefinition.id,
          name: definition.name,
          version: definition.version,
          type: definition.type
        });

        res.status(201).json({
          success: true,
          data: {
            definition: savedDefinition,
            validation
          },
          message: 'Workflow definition created successfully'
        });

      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /api/workflows/definitions:
   *   get:
   *     summary: Get workflow definitions
   *     tags: [Workflow Definitions]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [prior_authorization, claims_processing, appeal_management]
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [active, draft, deprecated]
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *     responses:
   *       200:
   *         description: List of workflow definitions
   */
  router.get(
    '/definitions',
    [
      query('type').optional().isIn(Object.values(WorkflowType)),
      query('status').optional().isIn(Object.values(WorkflowStatus)),
      query('page').optional().isInt({ min: 1 }),
      query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { type, status } = req.query;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const whereClause: any = {};
        if (type) whereClause.type = type;
        if (status) whereClause.status = status;

        // Using temporary repository pattern until models are added to Prisma schema
        const definitions: any[] = [];
        const total = 0;
        
        // TODO: Replace with actual Prisma queries when workflow models are added:
        // const [definitions, total] = await Promise.all([
        //   prisma.workflowDefinition.findMany({
        //     where: whereClause,
        //     skip: (page - 1) * limit,
        //     take: limit,
        //     orderBy: { createdAt: 'desc' },
        //     include: {
        //       _count: {
        //         select: {
        //           instances: true
        //         }
        //       }
        //     }
        //   }),
        //   prisma.workflowDefinition.count({ where: whereClause })
        // ]);

        res.json({
          success: true,
          data: {
            definitions,
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit)
            }
          }
        });

      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /api/workflows/definitions/{id}:
   *   get:
   *     summary: Get workflow definition by ID
   *     tags: [Workflow Definitions]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Workflow definition details
   *       404:
   *         description: Workflow definition not found
   */
  router.get(
    '/definitions/:id',
    [param('id').isUUID()],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;

        // Using temporary repository pattern until models are added to Prisma schema
        const definition: any = null;
        
        // TODO: Replace with actual Prisma query when workflow models are added:
        // const definition = await prisma.workflowDefinition.findUnique({
        //   where: { id },
        //   include: {
        //     instances: {
        //       select: {
        //         id: true,
        //         status: true,
        //         createdAt: true
        //       },
        //       orderBy: { createdAt: 'desc' },
        //       take: 10
        //     },
        //     _count: {
        //       select: {
        //         instances: true
        //       }
        //     }
        //   }
        // });

        if (!definition) {
          throw new AppError('Workflow definition not found', 404, 'DEFINITION_NOT_FOUND');
        }

        res.json({
          success: true,
          data: { definition }
        });

      } catch (error) {
        next(error);
      }
    }
  );

  // ========== Workflow Instance Management ==========

  /**
   * @swagger
   * /api/workflows/instances:
   *   post:
   *     summary: Start a new workflow instance
   *     tags: [Workflow Instances]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - definitionId
   *               - entityType
   *               - entityId
   *               - inputData
   *             properties:
   *               definitionId:
   *                 type: string
   *                 format: uuid
   *               entityType:
   *                 type: string
   *                 enum: [authorization_request, claim, case, patient, provider]
   *               entityId:
   *                 type: string
   *                 format: uuid
   *               inputData:
   *                 type: object
   *               priority:
   *                 type: string
   *                 enum: [low, normal, high, urgent]
   *                 default: normal
   *               assignedTo:
   *                 type: string
   *                 format: uuid
   *     responses:
   *       201:
   *         description: Workflow instance started successfully
   *       400:
   *         description: Invalid request data
   *       404:
   *         description: Workflow definition not found
   */
  router.post(
    '/instances',
    [
      body('definitionId').isUUID().withMessage('Valid definition ID is required'),
      body('entityType').isString().withMessage('Entity type is required'),
      body('entityId').isUUID().withMessage('Valid entity ID is required'),
      body('inputData').isObject().withMessage('Input data is required'),
      body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']),
      body('assignedTo').optional().isUUID()
    ],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
        }

        const { definitionId, entityType, entityId, inputData, priority = 'normal', assignedTo } = req.body;
        const userId = req.user?.id;

        // Get workflow definition using temporary repository
        const definition: any = null;
        
        // TODO: Replace with actual Prisma query when workflow models are added:
        // const definition = await prisma.workflowDefinition.findUnique({
        //   where: { id: definitionId }
        // });

        if (!definition) {
          throw new AppError('Workflow definition not found', 404, 'DEFINITION_NOT_FOUND');
        }

        // Create workflow instance using repository
        const instance = await workflowRepository.createWorkflowInstance({
          id: `instance_${Date.now()}`,
          definitionId,
          entityType,
          entityId,
          status: 'pending',
          priority,
          variables: inputData,
          inputData,
          assignedTo,
          createdBy: userId,
          version: 0
        });

        // Create workflow aggregate and start workflow
        const workflow = new WorkflowAggregate(instance.id);
        workflow.startWorkflow(
          definitionId,
          definition.version,
          entityType,
          entityId,
          inputData,
          priority,
          userId,
          assignedTo
        );

        // Save events
        const events = workflow.getUncommittedEvents();
        await eventStore.append(instance.id, events, 0);
        workflow.markEventsAsCommitted();

        // Update instance status using repository
        await workflowRepository.updateWorkflowInstance(
          { id: instance.id },
          { 
            status: 'running',
            version: events.length
          }
        );

        logger.info('Workflow instance started', {
          instanceId: instance.id,
          definitionId,
          entityType,
          entityId,
          priority
        });

        res.status(201).json({
          success: true,
          data: { instance },
          message: 'Workflow instance started successfully'
        });

      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /api/workflows/instances:
   *   get:
   *     summary: Get workflow instances
   *     tags: [Workflow Instances]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, running, completed, failed, cancelled]
   *       - in: query
   *         name: entityType
   *         schema:
   *           type: string
   *       - in: query
   *         name: assignedTo
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *     responses:
   *       200:
   *         description: List of workflow instances
   */
  router.get(
    '/instances',
    [
      query('status').optional().isIn(['pending', 'running', 'completed', 'failed', 'cancelled']),
      query('entityType').optional().isString(),
      query('assignedTo').optional().isUUID(),
      query('page').optional().isInt({ min: 1 }),
      query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { status, entityType, assignedTo } = req.query;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const whereClause: any = {};
        if (status) whereClause.status = status;
        if (entityType) whereClause.entityType = entityType;
        if (assignedTo) whereClause.assignedTo = assignedTo;

        // Using temporary repository pattern until models are added to Prisma schema
        const instances: any[] = [];
        const total = await workflowRepository.countWorkflowInstances(whereClause);
        
        // TODO: Replace with actual Prisma queries when workflow models are added:
        // const [instances, total] = await Promise.all([
        //   prisma.workflowInstance.findMany({
        //     where: whereClause,
        //     skip: (page - 1) * limit,
        //     take: limit,
        //     orderBy: { createdAt: 'desc' },
        //     include: {
        //       definition: {
        //         select: {
        //           name: true,
        //           type: true,
        //           version: true
        //         }
        //       },
        //       assignedUser: {
        //         select: {
        //           id: true,
        //           name: true,
        //           email: true
        //         }
        //       }
        //     }
        //   }),
        //   prisma.workflowInstance.count({ where: whereClause })
        // ]);

        res.json({
          success: true,
          data: {
            instances,
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit)
            }
          }
        });

      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /api/workflows/instances/{id}:
   *   get:
   *     summary: Get workflow instance details
   *     tags: [Workflow Instances]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Workflow instance details
   *       404:
   *         description: Workflow instance not found
   */
  router.get(
    '/instances/:id',
    [param('id').isUUID()],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;

        const [instance, events] = await Promise.all([
          workflowRepository.findWorkflowInstance({ id }),
          eventStore.getEvents(id)
        ]);
        
        // Using empty array for step executions until models are added
        const stepExecutions: any[] = [];
        
        // TODO: Add step execution query when models are added:
        // const stepExecutions = await prisma.workflowStepExecution.findMany({
        //   where: { workflowInstanceId: id },
        //   orderBy: { createdAt: 'asc' },
        //   include: {
        //     assignedUser: {
        //       select: {
        //         id: true,
        //         name: true,
        //         email: true
        //       }
        //     }
        //   }
        // });

        if (!instance) {
          throw new AppError('Workflow instance not found', 404, 'INSTANCE_NOT_FOUND');
        }

        res.json({
          success: true,
          data: {
            instance,
            events,
            stepExecutions
          }
        });

      } catch (error) {
        next(error);
      }
    }
  );

  // ========== Workflow Actions ==========

  /**
   * @swagger
   * /api/workflows/instances/{id}/actions/assign:
   *   post:
   *     summary: Assign workflow instance to a user
   *     tags: [Workflow Actions]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - assignedTo
   *             properties:
   *               assignedTo:
   *                 type: string
   *                 format: uuid
   *               reason:
   *                 type: string
   *     responses:
   *       200:
   *         description: Workflow assigned successfully
   *       404:
   *         description: Workflow instance not found
   */
  router.post(
    '/instances/:id/actions/assign',
    [
      param('id').isUUID(),
      body('assignedTo').isUUID().withMessage('Valid user ID is required'),
      body('reason').optional().isString()
    ],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const { assignedTo, reason } = req.body;
        const userId = req.user?.id;

        const instance = await workflowRepository.findWorkflowInstance({ id });

        if (!instance) {
          throw new AppError('Workflow instance not found', 404, 'INSTANCE_NOT_FOUND');
        }

        // Update assignment using repository
        await workflowRepository.updateWorkflowInstance(
          { id },
          {
            assignedTo,
            assignedAt: new Date()
          }
        );

        // Create assignment event
        const assignmentEvent = WorkflowEventFactory.createGenericEvent(
          id,
          WorkflowEventType.TASK_ASSIGNED,
          {
            assignedTo,
            assignedBy: userId,
            reason: reason || 'Manual assignment',
            previousAssignee: instance.assignedTo
          },
          'workflow-api',
          userId
        );

        await eventStore.append(id, [assignmentEvent], instance.version);

        logger.info('Workflow instance assigned', {
          instanceId: id,
          assignedTo,
          assignedBy: userId
        });

        res.json({
          success: true,
          message: 'Workflow assigned successfully'
        });

      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /api/workflows/instances/{id}/actions/decision:
   *   post:
   *     summary: Make a decision on a workflow instance
   *     tags: [Workflow Actions]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - decision
   *               - rationale
   *             properties:
   *               decision:
   *                 type: string
   *                 enum: [approve, deny, pend, request_info]
   *               rationale:
   *                 type: string
   *               confidence:
   *                 type: number
   *                 minimum: 0
   *                 maximum: 1
   *               conditions:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: Decision recorded successfully
   *       404:
   *         description: Workflow instance not found
   */
  router.post(
    '/instances/:id/actions/decision',
    [
      param('id').isUUID(),
      body('decision').isIn(['approve', 'deny', 'pend', 'request_info']),
      body('rationale').isString().withMessage('Rationale is required'),
      body('confidence').optional().isFloat({ min: 0, max: 1 }),
      body('conditions').optional().isArray()
    ],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const { decision, rationale, confidence = 1.0, conditions = [] } = req.body;
        const userId = req.user?.id;

        const instance = await workflowRepository.findWorkflowInstance({ id });

        if (!instance) {
          throw new AppError('Workflow instance not found', 404, 'INSTANCE_NOT_FOUND');
        }

        // Create decision event
        const decisionEvent = WorkflowEventFactory.createDecisionMadeEvent(
          id,
          'manual_decision', // stepExecutionId
          decision,
          rationale,
          confidence,
          [], // rulesApplied
          [], // alternatives
          userId,
          userId // reviewerId
        );

        await eventStore.append(id, [decisionEvent], instance.version);

        // Update instance if decision is final
        if (['approve', 'deny'].includes(decision)) {
          await workflowRepository.updateWorkflowInstance(
            { id },
            {
              status: decision === 'approve' ? 'completed' : 'failed',
              completedAt: new Date(),
              outputData: {
                decision,
                rationale,
                conditions,
                decidedBy: userId,
                decidedAt: new Date()
              }
            }
          );
        }

        logger.info('Workflow decision made', {
          instanceId: id,
          decision,
          decidedBy: userId,
          confidence
        });

        res.json({
          success: true,
          message: 'Decision recorded successfully',
          data: {
            decision,
            rationale,
            confidence
          }
        });

      } catch (error) {
        next(error);
      }
    }
  );

  // ========== Analytics and Monitoring ==========

  /**
   * @swagger
   * /api/workflows/analytics:
   *   get:
   *     summary: Get workflow analytics
   *     tags: [Analytics]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: workflowType
   *         schema:
   *           type: string
   *       - in: query
   *         name: startDate
   *         schema:
   *           type: string
   *           format: date-time
   *       - in: query
   *         name: endDate
   *         schema:
   *           type: string
   *           format: date-time
   *     responses:
   *       200:
   *         description: Workflow analytics data
   */
  router.get(
    '/analytics',
    [
      query('workflowType').optional().isIn(Object.values(WorkflowType)),
      query('startDate').optional().isISO8601(),
      query('endDate').optional().isISO8601()
    ],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { workflowType, startDate, endDate } = req.query;

        const timeRange = startDate && endDate ? {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        } : undefined;

        const analytics = await workflowAnalyticsEngine.getWorkflowAnalytics(
          workflowType as WorkflowType,
          timeRange
        );

        res.json({
          success: true,
          data: { analytics }
        });

      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * @swagger
   * /api/workflows/health:
   *   get:
   *     summary: Get workflow system health status
   *     tags: [Monitoring]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: System health status
   */
  router.get(
    '/health',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const [
          integrationHealth,
          eventStoreHealth,
          rulesEngineHealth
        ] = await Promise.all([
          integrationManager.healthCheckAll(),
          eventStore.getEvents('health-check', 0).then(() => true).catch(() => false),
          businessRulesEngine.evaluateRules('medical' as RuleCategory, {}).then(() => true).catch(() => false)
        ]);

        const overallHealth = Object.values(integrationHealth).every(Boolean) &&
                             eventStoreHealth &&
                             rulesEngineHealth;

        res.json({
          success: true,
          data: {
            status: overallHealth ? 'healthy' : 'degraded',
            components: {
              integrations: integrationHealth,
              eventStore: eventStoreHealth,
              rulesEngine: rulesEngineHealth
            },
            timestamp: new Date()
          }
        });

      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createWorkflowRoutes;