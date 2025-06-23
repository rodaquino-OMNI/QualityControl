import { Router, Request, Response, NextFunction } from 'express';
const { body, param, query, validationResult } = require('express-validator');
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { queues } from '../config/queues';
import { logger, logAuditEvent } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { blockchainService } from '../services/blockchain.service';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /decisions:
 *   post:
 *     summary: Create a new decision for a case
 *     tags: [Decisions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - caseId
 *               - decision
 *               - justification
 *             properties:
 *               caseId:
 *                 type: string
 *                 format: uuid
 *               decision:
 *                 type: string
 *                 enum: [approved, denied, partial]
 *               justification:
 *                 type: string
 *                 minLength: 10
 *               approvedAmount:
 *                 type: number
 *                 description: Required for partial approvals
 *               conditions:
 *                 type: array
 *                 items:
 *                   type: string
 *               followUpRequired:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Decision created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     decision:
 *                       $ref: '#/components/schemas/Decision'
 *                     blockchainTx:
 *                       type: string
 *       400:
 *         description: Validation error
 *       404:
 *         description: Case not found
 */
router.post(
  '/',
  authorize('admin', 'auditor'),
  [
    body('caseId').isUUID(),
    body('decision').isIn(['approved', 'denied', 'partial']),
    body('justification').isLength({ min: 10 }).trim(),
    body('approvedAmount').optional().isFloat({ min: 0 }),
    body('conditions').optional().isArray(),
    body('followUpRequired').optional().isBoolean(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const {
        caseId,
        decision,
        justification,
        approvedAmount,
        conditions,
        followUpRequired,
      } = req.body;

      // Validate partial approval
      if (decision === 'partial' && !approvedAmount) {
        throw new AppError(
          'Approved amount is required for partial approvals',
          400,
          'MISSING_APPROVED_AMOUNT'
        );
      }

      // Get authorization request with details
      const authRequest = await prisma.authorizationRequest.findUnique({
        where: { id: caseId }, // Using caseId as authorizationRequestId
        include: {
          patient: true,
          procedure: true,
        },
      });

      if (!authRequest) {
        throw new AppError('Authorization request not found', 404, 'AUTH_REQUEST_NOT_FOUND');
      }

      // Check if authorization already has a decision
      const existingDecision = await prisma.authorizationDecision.findFirst({
        where: { authorizationRequestId: caseId },
      });

      if (existingDecision) {
        throw new AppError('Authorization already has a decision', 400, 'AUTH_ALREADY_DECIDED');
      }

      // Get AI analysis separately if available
      const aiAnalysis = await prisma.aIAnalysis.findFirst({
        where: {
          entityId: caseId,
          entityType: 'authorization',
        },
        orderBy: { createdAt: 'desc' },
      });

      // Calculate processing time
      const processingTime = Math.floor(
        (Date.now() - authRequest.createdAt.getTime()) / 1000
      );

      // Map decision to Decision enum
      let decisionEnum: 'approved' | 'denied' | 'partial' | 'deferred';
      if (decision === 'approved') decisionEnum = 'approved';
      else if (decision === 'denied') decisionEnum = 'denied';
      else if (decision === 'partial') decisionEnum = 'partial';
      else decisionEnum = 'deferred';

      // Calculate valid dates
      const validFrom = new Date();
      const validUntil = new Date();
      validUntil.setMonth(validUntil.getMonth() + 6); // Default 6 months validity

      // Create decision
      const newDecision = await prisma.authorizationDecision.create({
        data: {
          authorizationRequestId: caseId,
          reviewerId: req.user!.id,
          decision: decisionEnum,
          decisionType: 'manual',
          decisionRationale: justification,
          conditionsApplied: conditions || [],
          validFrom,
          validUntil,
          appealDeadline: followUpRequired ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
        },
        include: {
          reviewer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          authorizationRequest: {
            select: {
              id: true,
              requestNumber: true,
              procedureId: true,
            },
          },
        },
      });

      // Update authorization request status
      let authStatus: 'approved' | 'denied' | 'pending' | 'in_review' | 'expired' | 'cancelled';
      if (decision === 'approved') authStatus = 'approved';
      else if (decision === 'denied') authStatus = 'denied';
      else if (decision === 'partial') authStatus = 'approved'; // Partial is still approved
      else authStatus = 'in_review';

      await prisma.authorizationRequest.update({
        where: { id: caseId },
        data: {
          status: authStatus,
          updatedAt: new Date(),
        },
      });

      // Record in blockchain if enabled
      let blockchainTx = null;
      if (process.env.ENABLE_BLOCKCHAIN_AUDIT === 'true') {
        try {
          blockchainTx = await blockchainService.recordDecision({
            caseId,
            decision,
            auditorId: req.user!.id,
            justification,
            aiHash: aiAnalysis?.id || '',
          });
        } catch (error) {
          logger.error('Blockchain recording failed:', error);
          // Continue without blockchain record
        }
      }

      // Queue notifications
      await queues.notifications.add('decision-made', {
        authorizationId: caseId,
        decision,
        patientId: authRequest.patientId,
      });

      // Queue analytics update
      await queues.analytics.add('update-metrics', {
        type: 'decision',
        data: {
          reviewerId: req.user!.id,
          decision,
          processingTime,
          aiAgreement: aiAnalysis ? decision === (aiAnalysis.result as any).recommendation : null,
        },
      });

      // Invalidate cache
      await cache.invalidatePattern(`cases:*`);
      await cache.invalidatePattern(`decisions:*`);

      logAuditEvent('decision.created', req.user!.id, caseId, {
        decision,
        processingTime,
        blockchainTx,
      });

      res.status(201).json({
        success: true,
        data: {
          decision: newDecision,
          blockchainTx,
        },
        message: 'Decision recorded successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /decisions/{id}:
 *   get:
 *     summary: Get decision by ID
 *     tags: [Decisions]
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
 *         description: Decision details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     decision:
 *                       $ref: '#/components/schemas/Decision'
 *       404:
 *         description: Decision not found
 */
router.get(
  '/:id',
  [param('id').isUUID()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { id } = req.params;

      const decision = await prisma.authorizationDecision.findUnique({
        where: { id },
        include: {
          authorizationRequest: {
            include: {
              patient: true,
              procedure: true,
              requestingProvider: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!decision) {
        throw new AppError('Decision not found', 404, 'DECISION_NOT_FOUND');
      }

      res.json({
        success: true,
        data: { decision },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /decisions:
 *   get:
 *     summary: Get all decisions with filters
 *     tags: [Decisions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: decision
 *         schema:
 *           type: string
 *           enum: [approved, denied, partial]
 *       - in: query
 *         name: auditorId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
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
 *         description: List of decisions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.get(
  '/',
  [
    query('decision').optional().isIn(['approved', 'denied', 'partial']),
    query('auditorId').optional().isUUID(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const {
        decision,
        auditorId,
        dateFrom,
        dateTo,
        page = 1,
        limit = 20,
      } = req.query;

      // Build filter
      const where: any = {};
      if (decision) where.decision = decision;
      if (auditorId) where.reviewerId = auditorId;
      if (dateFrom || dateTo) {
        where.decidedAt = {};
        if (dateFrom) where.decidedAt.gte = new Date(dateFrom as string);
        if (dateTo) where.decidedAt.lte = new Date(dateTo as string);
      }

      // Get decisions
      const [decisions, total] = await Promise.all([
        prisma.authorizationDecision.findMany({
          where,
          skip: ((page as number) - 1) * (limit as number),
          take: limit as number,
          orderBy: { decidedAt: 'desc' },
          include: {
            authorizationRequest: {
              select: {
                id: true,
                requestNumber: true,
                urgencyLevel: true,
                procedure: {
                  select: {
                    code: true,
                    name: true,
                  },
                },
              },
            },
            reviewer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        }),
        prisma.authorizationDecision.count({ where }),
      ]);

      res.json({
        success: true,
        data: { decisions },
        meta: {
          page: page as number,
          limit: limit as number,
          total,
          totalPages: Math.ceil(total / (limit as number)),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /decisions/{id}/appeal:
 *   post:
 *     summary: Create an appeal for a decision
 *     tags: [Decisions]
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
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 20
 *               additionalDocuments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     url:
 *                       type: string
 *                     name:
 *                       type: string
 *     responses:
 *       201:
 *         description: Appeal created successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Decision not found
 */
router.post(
  '/:id/appeal',
  [
    param('id').isUUID(),
    body('reason').isLength({ min: 20 }).trim(),
    body('additionalDocuments').optional().isArray(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { id } = req.params;
      const { reason, additionalDocuments } = req.body;

      // Get decision
      const decision = await prisma.authorizationDecision.findUnique({
        where: { id },
        include: {
          authorizationRequest: true,
        },
      });

      if (!decision) {
        throw new AppError('Decision not found', 404, 'DECISION_NOT_FOUND');
      }

      // Check if appeal already exists by checking metadata
      const existingCase = await prisma.case.findFirst({
        where: {
          metadata: {
            path: ['appealForDecisionId'],
            equals: id,
          },
        },
      });

      if (existingCase) {
        throw new AppError('Appeal already exists for this decision', 400, 'APPEAL_EXISTS');
      }

      // Create appeal as a new case
      const appeal = await prisma.case.create({
        data: {
          title: `Appeal for Authorization ${decision.authorizationRequest.requestNumber}`,
          description: reason,
          procedureCode: (decision.authorizationRequest as any).procedureId,
          patientId: decision.authorizationRequest.patientId,
          priority: 'high',
          status: 'open',
          createdBy: req.user!.id,
          metadata: {
            appealForDecisionId: id,
            authorizationRequestId: decision.authorizationRequestId,
            originalDecision: decision.decision,
            additionalDocuments: additionalDocuments || [],
          },
        },
      });

      // Update authorization request status
      await prisma.authorizationRequest.update({
        where: { id: decision.authorizationRequestId },
        data: {
          status: 'in_review',
        },
      });

      // Queue notification
      await queues.notifications.add('appeal-created', {
        appealId: appeal.id,
        authorizationRequestId: decision.authorizationRequestId,
        decisionId: id,
      });

      logAuditEvent('decision.appeal.created', req.user!.id, id, {
        decisionId: id,
        authorizationRequestId: decision.authorizationRequestId,
        appealId: appeal.id,
      });

      res.status(201).json({
        success: true,
        data: { appeal },
        message: 'Appeal created successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as decisionRoutes };