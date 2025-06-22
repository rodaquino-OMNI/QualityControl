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

      // Get case with AI analysis
      const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
          aiAnalyses: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!caseData) {
        throw new AppError('Case not found', 404, 'CASE_NOT_FOUND');
      }

      // Check if case is already decided
      if (['approved', 'denied', 'partial'].includes(caseData.status)) {
        throw new AppError('Case already has a decision', 400, 'CASE_ALREADY_DECIDED');
      }

      // Calculate processing time
      const processingTime = Math.floor(
        (Date.now() - caseData.createdAt.getTime()) / 1000
      );

      // Create decision
      const newDecision = await prisma.decision.create({
        data: {
          caseId,
          auditorId: req.user!.id,
          decision,
          justification,
          approvedAmount: decision === 'partial' ? approvedAmount : caseData.value,
          conditions,
          followUpRequired,
          aiRecommendation: caseData.aiAnalyses[0]?.recommendation,
          aiConfidence: caseData.aiAnalyses[0]?.confidence,
          processingTime,
        },
        include: {
          auditor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Update case status
      await prisma.case.update({
        where: { id: caseId },
        data: {
          status: decision,
          decidedAt: new Date(),
          decidedBy: req.user!.id,
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
            aiHash: caseData.aiAnalyses[0]?.id || '',
          });
        } catch (error) {
          logger.error('Blockchain recording failed:', error);
          // Continue without blockchain record
        }
      }

      // Queue notifications
      await queues.notifications.add('decision-made', {
        caseId,
        decision,
        patientId: caseData.patientId,
      });

      // Queue analytics update
      await queues.analytics.add('update-metrics', {
        type: 'decision',
        data: {
          auditorId: req.user!.id,
          decision,
          processingTime,
          aiAgreement: decision === caseData.aiAnalyses[0]?.recommendation,
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

      const decision = await prisma.decision.findUnique({
        where: { id },
        include: {
          case: {
            include: {
              patient: true,
            },
          },
          auditor: {
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
      if (auditorId) where.auditorId = auditorId;
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
        if (dateTo) where.createdAt.lte = new Date(dateTo as string);
      }

      // Get decisions
      const [decisions, total] = await Promise.all([
        prisma.decision.findMany({
          where,
          skip: ((page as number) - 1) * (limit as number),
          take: limit as number,
          orderBy: { createdAt: 'desc' },
          include: {
            case: {
              select: {
                id: true,
                procedureCode: true,
                value: true,
                priority: true,
              },
            },
            auditor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        }),
        prisma.decision.count({ where }),
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
      const decision = await prisma.decision.findUnique({
        where: { id },
        include: {
          case: true,
        },
      });

      if (!decision) {
        throw new AppError('Decision not found', 404, 'DECISION_NOT_FOUND');
      }

      // Check if appeal already exists
      const existingAppeal = await prisma.appeal.findFirst({
        where: { decisionId: id },
      });

      if (existingAppeal) {
        throw new AppError('Appeal already exists for this decision', 400, 'APPEAL_EXISTS');
      }

      // Create appeal
      const appeal = await prisma.appeal.create({
        data: {
          decisionId: id,
          caseId: decision.caseId,
          reason,
          requestedBy: req.user!.id,
          status: 'pending',
          documents: additionalDocuments ? {
            create: additionalDocuments,
          } : undefined,
        },
      });

      // Update case status
      await prisma.case.update({
        where: { id: decision.caseId },
        data: {
          status: 'in_review',
          hasAppeal: true,
        },
      });

      // Queue notification
      await queues.notifications.add('appeal-created', {
        appealId: appeal.id,
        caseId: decision.caseId,
        decisionId: id,
      });

      logAuditEvent('decision.appeal.created', req.user!.id, id, {
        decisionId: id,
        caseId: decision.caseId,
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