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
 *           enum: [open, in_progress, resolved, closed, cancelled]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
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
 *       400:
 *         description: Invalid request parameters
 */
router.get(
  '/',
  authorize('admin', 'auditor', 'reviewer'),
  [
    query('status').optional().isIn(['open', 'in_progress', 'resolved', 'closed', 'cancelled']),
    query('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'priority', 'status', 'requestDate']),
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

      const cacheKey = `cases:list:${JSON.stringify(req.query)}`;
      const cached = await cache.get(cacheKey);

      if (cached) {
        res.json(cached);
        return;
      }

      const skip = (Number(page) - 1) * Number(limit);
      const where: any = {};

      if (status) where.status = status;
      if (priority) where.priority = priority;

      const [cases, total] = await Promise.all([
        prisma.case.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { [sortBy as string]: sortOrder },
          include: {
            patient: {
              select: {
                id: true,
                patientCode: true,
                riskCategory: true,
              },
            },
            assignedUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            creator: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            attachments: {
              select: {
                id: true,
                fileName: true,
                fileType: true,
                fileSize: true,
                url: true,
                createdAt: true,
              },
            },
            // Relations not in current schema - commented out
            // decisions: {},
            // aIAnalyses: {},
          },
        }),
        prisma.case.count({ where }),
      ]);

      const result = {
        success: true,
        data: {
          cases,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      };

      await cache.set(cacheKey, result, 300); // Cache for 5 minutes
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
 *     summary: Get a specific case by ID
 *     tags: [Cases]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Case details
 *       404:
 *         description: Case not found
 */
router.get(
  '/:id',
  authorize('admin', 'auditor', 'reviewer'),
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { id } = req.params;
      const cacheKey = `case:${id}`;
      const cached = await cache.get(cacheKey);

      if (cached) {
        res.json(cached);
        return;
      }

      const caseData = await prisma.case.findUnique({
        where: { id },
        include: {
          patient: true,
          assignedUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          notes: {
            include: {
              authorUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          attachments: true,
          activities: {
            include: {
              userEntity: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: { timestamp: 'desc' },
          },
          // Relations not in current schema - commented out
          // decisions: {},
          // aIAnalyses: {},
        },
      });

      if (!caseData) {
        throw new AppError('Case not found', 404, 'CASE_NOT_FOUND');
      }

      // Log access
      logAuditEvent('case.viewed', req.user!.id, id, {});

      const result = {
        success: true,
        data: { case: caseData },
      };

      await cache.set(cacheKey, result, 600); // Cache for 10 minutes
      res.json(result);
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
 *                 enum: [low, medium, high, critical]
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     fileName:
 *                       type: string
 *                     fileType:
 *                       type: string
 *                     fileSize:
 *                       type: integer
 *                     url:
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
    body('patientId').notEmpty().isUUID(),
    body('procedureCode').notEmpty().trim().isLength({ min: 1, max: 50 }),
    body('procedureDescription').notEmpty().trim().isLength({ min: 1, max: 1000 }),
    body('value').isFloat({ min: 0 }),
    body('priority').isIn(['low', 'medium', 'high', 'critical']),
    body('attachments').optional().isArray(),
    body('attachments.*.fileName').optional().isString(),
    body('attachments.*.fileType').optional().isString(),
    body('attachments.*.fileSize').optional().isInt({ min: 0 }),
    body('attachments.*.url').optional().isURL(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { patientId, procedureCode, procedureDescription, value, priority, attachments } = req.body;

      // Verify patient exists
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
      });

      if (!patient) {
        throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
      }

      // Create case with NEW SCHEMA STRUCTURE
      const newCase = await prisma.case.create({
        data: {
          patientId,
          patientName: patient.patientCode, // Use patient code as name for now
          title: procedureCode,
          description: procedureDescription,
          // Fields not in current schema - store in metadata
          priority,
          status: 'open',
          createdBy: req.user!.id,
          // Store additional metadata for backward compatibility
          metadata: {
            procedureCode,
            procedureDescription,
            value,
            originalRequestDate: new Date().toISOString(),
          },
          // Create attachments if provided
          attachments: attachments ? {
            create: attachments.map((attachment: any) => ({
              ...attachment,
              uploadedBy: req.user!.id,
            })),
          } : undefined,
        },
        include: {
          patient: {
            select: {
              id: true,
              patientCode: true,
              riskCategory: true,
            },
          },
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          attachments: true,
        },
      });

      // Queue AI analysis
      await queues.aIAnalysis.add('analyze-case', {
        caseId: newCase.id,
        priority: newCase.priority,
        procedureCode: procedureCode,
        value: value,
        patientRiskCategory: patient.riskCategory,
      }, {
        priority: priority === 'critical' ? 1 : priority === 'high' ? 2 : 3,
      });

      // Queue fraud detection
      await queues.fraudDetection.add('check-fraud', {
        caseId: newCase.id,
        patientId: newCase.patientId,
        procedureCode: procedureCode,
        value: value,
        title: newCase.title,
        status: newCase.status,
      });

      // Invalidate cache
      await cache.invalidatePattern('cases:*');

      logAuditEvent('case.created', req.user!.id, newCase.id, {
        caseId: newCase.id,
        patientId,
        procedureCode,
        procedureDescription,
        value,
        priority,
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
 * /cases/{id}:
 *   put:
 *     summary: Update a case
 *     tags: [Cases]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               procedureCode:
 *                 type: string
 *               procedureDescription:
 *                 type: string
 *               value:
 *                 type: number
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *               status:
 *                 type: string
 *                 enum: [open, in_progress, resolved, closed, cancelled]
 *               assignedTo:
 *                 type: string
 *     responses:
 *       200:
 *         description: Case updated successfully
 *       404:
 *         description: Case not found
 */
router.put(
  '/:id',
  authorize('admin', 'auditor'),
  [
    param('id').isUUID(),
    body('title').optional().trim().isLength({ min: 1, max: 255 }),
    body('description').optional().trim(),
    body('procedureCode').optional().trim().isLength({ min: 1, max: 50 }),
    body('procedureDescription').optional().trim().isLength({ min: 1, max: 1000 }),
    body('value').optional().isFloat({ min: 0 }),
    body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
    body('status').optional().isIn(['open', 'in_progress', 'resolved', 'closed', 'cancelled']),
    body('assignedTo').optional().isUUID(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { id } = req.params;
      const updateData = req.body;

      // Check if case exists
      const existingCase = await prisma.case.findUnique({
        where: { id },
      });

      if (!existingCase) {
        throw new AppError('Case not found', 404, 'CASE_NOT_FOUND');
      }

      // Verify assignedTo user exists if provided
      if (updateData.assignedTo) {
        const assignedUser = await prisma.user.findUnique({
          where: { id: updateData.assignedTo },
        });

        if (!assignedUser) {
          throw new AppError('Assigned user not found', 404, 'USER_NOT_FOUND');
        }
      }

      // Update case with new schema structure
      const updatedData: any = { ...updateData };
      
      // Update metadata for backward compatibility
      if (updateData.procedureCode || updateData.procedureDescription || updateData.value) {
        const existingMetadata = (existingCase.metadata as any) || {};
        updatedData.metadata = {
          ...existingMetadata,
          ...(updateData.procedureCode && { procedureCode: updateData.procedureCode }),
          ...(updateData.procedureDescription && { procedureDescription: updateData.procedureDescription }),
          ...(updateData.value && { value: updateData.value }),
          lastModified: new Date().toISOString(),
        };
      }

      const updatedCase = await prisma.case.update({
        where: { id },
        data: updatedData,
        include: {
          patient: {
            select: {
              id: true,
              patientCode: true,
              riskCategory: true,
            },
          },
          assignedUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          attachments: true,
          // decisions: {}, // Not in current schema
        },
      });

      // Log the update
      logAuditEvent('case.updated', req.user!.id, id, {
        changes: updateData,
        oldData: {
          title: existingCase.title,
          description: existingCase.description,
          priority: existingCase.priority,
          status: existingCase.status,
        },
      });

      // Invalidate cache
      await cache.invalidatePattern('cases:*');
      await cache.del(`case:${id}`);

      res.json({
        success: true,
        data: { case: updatedCase },
        message: 'Case updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;