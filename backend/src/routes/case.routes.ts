import { Router, Request, Response, NextFunction } from 'express';
const { body, query, param, validationResult } = require('express-validator');
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { queues } from '../config/queues';
import { logger, logAuditEvent } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /cases:
 *   get:
 *     summary: Get all cases
 *     tags: [Cases]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in_review, approved, denied, partial]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
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
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: List of cases
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.get(
  '/',
  [
    query('status').optional().isIn(['pending', 'in_review', 'approved', 'denied', 'partial']),
    query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'priority', 'value']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const {
        status,
        priority,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      // Build filter
      const where: any = {};
      if (status) where.status = status;
      if (priority) where.priority = priority;

      // Check cache
      const cacheKey = `cases:${JSON.stringify({ where, page, limit, sortBy, sortOrder })}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      // Get cases
      const [cases, total] = await Promise.all([
        prisma.case.findMany({
          where,
          skip: ((page as number) - 1) * (limit as number),
          take: limit as number,
          orderBy: {
            [sortBy as string]: sortOrder,
          },
          include: {
            patient: {
              select: {
                id: true,
                patientCode: true,
                birthYear: true,
                gender: true,
              },
            },
            // No decisions relation on Case model
          },
        }),
        prisma.case.count({ where }),
      ]);

      const result = {
        success: true,
        data: { cases },
        meta: {
          page: page as number,
          limit: limit as number,
          total,
          totalPages: Math.ceil(total / (limit as number)),
        },
      };

      // Cache result
      await cache.set(cacheKey, result, 60); // 1 minute

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /cases/{id}:
 *   get:
 *     summary: Get case by ID
 *     tags: [Cases]
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
 *         description: Case details
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
 *                     case:
 *                       $ref: '#/components/schemas/Case'
 *       404:
 *         description: Case not found
 */
router.get(
  '/:id',
  [param('id').isUUID()],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { id } = req.params;

      const caseData = await prisma.case.findUnique({
        where: { id },
        include: {
          patient: true,
          attachments: true,
          // decisions: { // Removed - not in schema
          //   include: {
          //     auditor: {
          //       select: {
          //         id: true,
          //         name: true,
          //         email: true,
          //       },
          //     },
          //   },
          //   orderBy: { createdAt: 'desc' },
          // },
          // aIAnalyses: { // Removed - not in schema
          //   orderBy: { createdAt: 'desc' },
          // },
        },
      });

      if (!caseData) {
        throw new AppError('Case not found', 404, 'CASE_NOT_FOUND');
      }

      // Log access
      logAuditEvent('case.viewed', req.user!.id, id, {});

      res.json({
        success: true,
        data: { case: caseData },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /cases:
 *   post:
 *     summary: Create a new case
 *     tags: [Cases]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - procedureCode
 *               - procedureDescription
 *               - value
 *               - priority
 *             properties:
 *               patientId:
 *                 type: string
 *               procedureCode:
 *                 type: string
 *               procedureDescription:
 *                 type: string
 *               value:
 *                 type: number
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *               attachments:
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
 *         description: Case created successfully
 *       400:
 *         description: Validation error
 */
router.post(
  '/',
  authorize('admin', 'auditor'),
  [
    body('patientId').notEmpty(),
    body('procedureCode').notEmpty().trim(),
    body('procedureDescription').notEmpty().trim(),
    body('value').isFloat({ min: 0 }),
    body('priority').isIn(['low', 'medium', 'high', 'urgent']),
    body('attachments').optional().isArray(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { patientId, procedureCode, procedureDescription, value, priority, attachments } = req.body;

      // Create case
      const newCase = await prisma.case.create({
        data: {
          patientId,
          procedureCode,
          procedureDescription,
          value,
          priority,
          status: 'open',
          requestDate: new Date(),
          attachments: attachments ? {
            create: attachments,
          } : undefined,
        },
        include: {
          patient: true,
          attachments: true,
        },
      });

      // Queue AI analysis
      await queues.aIAnalysis.add('analyze-case', {
        caseId: newCase.id,
        priority: newCase.priority,
      }, {
        priority: priority === 'urgent' ? 1 : priority === 'high' ? 2 : 3,
      });

      // Queue fraud detection
      await queues.fraudDetection.add('check-fraud', {
        caseId: newCase.id,
        patientId: newCase.patientId,
        title: newCase.title,
        status: newCase.status,
      });

      // Invalidate cache
      await cache.invalidatePattern('cases:*');

      logAuditEvent('case.created', req.user!.id, newCase.id, {
        caseId: newCase.id,
        patientId,
        procedureCode,
        value,
      });

      res.status(201).json({
        success: true,
        data: { case: newCase },
        message: 'Case created successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /cases/{id}/status:
 *   patch:
 *     summary: Update case status
 *     tags: [Cases]
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, in_review, approved, denied, partial]
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       404:
 *         description: Case not found
 */
router.patch(
  '/:id/status',
  authorize('admin', 'auditor'),
  [
    param('id').isUUID(),
    body('status').isIn(['pending', 'in_review', 'approved', 'denied', 'partial']),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { id } = req.params;
      const { status } = req.body;

      const updatedCase = await prisma.case.update({
        where: { id },
        data: {
          status,
          updatedAt: new Date(),
        },
      });

      // Invalidate cache
      await cache.invalidatePattern(`cases:*`);

      logAuditEvent('case.statusUpdated', req.user!.id, id, {
        caseId: id,
        oldStatus: updatedCase.status,
        newStatus: status,
      });

      res.json({
        success: true,
        data: { case: updatedCase },
        message: 'Status updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /cases/{id}/assign:
 *   post:
 *     summary: Assign case to auditor
 *     tags: [Cases]
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
 *               - auditorId
 *             properties:
 *               auditorId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Case assigned successfully
 *       404:
 *         description: Case not found
 */
router.post(
  '/:id/assign',
  authorize('admin'),
  [
    param('id').isUUID(),
    body('auditorId').isUUID(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { id } = req.params;
      const { auditorId } = req.body;

      const updatedCase = await prisma.case.update({
        where: { id },
        data: {
          assignedTo: auditorId,
          status: 'in_progress',
          assignedAt: new Date(),
        },
      });

      // Send notification
      await queues.notifications.add('send-notification', {
        type: 'case_assigned',
        userId: auditorId,
        data: {
          caseId: id,
          priority: updatedCase.priority,
        },
      });

      logAuditEvent('case.assigned', req.user!.id, id, {
        caseId: id,
        auditorId,
      });

      res.json({
        success: true,
        data: { case: updatedCase },
        message: 'Case assigned successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as caseRoutes };