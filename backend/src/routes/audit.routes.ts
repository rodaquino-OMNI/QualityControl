import { Router, Request, Response, NextFunction } from 'express';
const { query, param, validationResult } = require('express-validator');
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { logger, logAuditEvent } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { queues } from '../config/queues';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /audit/trail:
 *   get:
 *     summary: Get audit trail
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [case, decision, user, appeal]
 *       - in: query
 *         name: entityId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Audit trail entries
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
 *                     auditLogs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           action:
 *                             type: string
 *                           entityType:
 *                             type: string
 *                           entityId:
 *                             type: string
 *                           userId:
 *                             type: string
 *                           userName:
 *                             type: string
 *                           metadata:
 *                             type: object
 *                           ipAddress:
 *                             type: string
 *                           userAgent:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                 meta:
 *                   type: object
 */
router.get(
  '/trail',
  authorize('admin', 'auditor'),
  [
    query('entityType').optional().isIn(['case', 'decision', 'user', 'appeal']),
    query('entityId').optional().isUUID(),
    query('userId').optional().isUUID(),
    query('action').optional().isString(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const {
        entityType,
        entityId,
        userId,
        action,
        dateFrom,
        dateTo,
        page = 1,
        limit = 50,
      } = req.query;

      // Build filter
      const where: any = {};
      if (entityType) where.entityType = entityType;
      if (entityId) where.entityId = entityId;
      if (userId) where.userId = userId;
      if (action) where.action = { contains: action };
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
        if (dateTo) where.createdAt.lte = new Date(dateTo as string);
      }

      // Get audit logs
      const [auditLogs, total] = await Promise.all([
        prisma.activityLog.findMany({
          where,
          skip: ((page as number) - 1) * (limit as number),
          take: limit as number,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        }),
        prisma.activityLog.count({ where }),
      ]);

      res.json({
        success: true,
        data: {
          auditLogs: auditLogs.map((log: any) => ({
            ...log,
            userName: log.user?.name,
            userEmail: log.user?.email,
          })),
        },
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
 * /audit/compliance-report:
 *   get:
 *     summary: Generate compliance report
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: reportType
 *         schema:
 *           type: string
 *           enum: [summary, detailed, regulatory]
 *           default: summary
 *     responses:
 *       200:
 *         description: Compliance report
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
 *                     report:
 *                       type: object
 *                       properties:
 *                         period:
 *                           type: object
 *                         statistics:
 *                           type: object
 *                         compliance:
 *                           type: object
 *                         risks:
 *                           type: array
 *                         recommendations:
 *                           type: array
 */
router.get(
  '/compliance-report',
  authorize('admin'),
  [
    query('startDate').isISO8601(),
    query('endDate').isISO8601(),
    query('reportType').optional().isIn(['summary', 'detailed', 'regulatory']),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { startDate, endDate, reportType = 'summary' } = req.query;

      // Check cache
      const cacheKey = `compliance:${startDate}:${endDate}:${reportType}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      // Get statistics
      const [
        totalCases,
        totalDecisions,
        avgProcessingTime,
        aiAgreementRate,
        appealRate,
        fraudDetectionRate,
      ] = await Promise.all([
        prisma.case.count({
          where: { createdAt: { gte: start, lte: end } },
        }),
        prisma.authorizationDecision.count({
          where: { createdAt: { gte: start, lte: end } },
        }),
        prisma.authorizationDecision.aggregate({
          where: { createdAt: { gte: start, lte: end } },
          _avg: { processingTime: true },
        }),
        // AI agreement rate
        prisma.$queryRaw<[{ rate: number }]>`
          SELECT 
            CAST(COUNT(CASE WHEN d.decision = d.ai_recommendation THEN 1 END) AS FLOAT) / 
            NULLIF(COUNT(*), 0) as rate
          FROM authorization_decisions d
          WHERE d.created_at BETWEEN ${start} AND ${end}
            AND d.ai_recommendation IS NOT NULL
        `,
        // Appeal rate
        prisma.$queryRaw<[{ rate: number }]>`
          SELECT 
            CAST(COUNT(DISTINCT a.case_id) AS FLOAT) / 
            NULLIF(COUNT(DISTINCT d.case_id), 0) as rate
          FROM authorization_decisions d
          LEFT JOIN appeals a ON a.decision_id = d.id
          WHERE d.created_at BETWEEN ${start} AND ${end}
        `,
        // Fraud detection rate
        prisma.$queryRaw<[{ rate: number }]>`
          SELECT 
            CAST(COUNT(CASE WHEN fraud_score > 0.7 THEN 1 END) AS FLOAT) / 
            NULLIF(COUNT(*), 0) as rate
          FROM cases
          WHERE created_at BETWEEN ${start} AND ${end}
            AND fraud_score IS NOT NULL
        `,
      ]);

      // Decision breakdown
      const decisionBreakdown = await prisma.decision.groupBy({
        by: ['decision'],
        where: { createdAt: { gte: start, lte: end } },
        _count: true,
      });

      // Auditor performance
      const auditorPerformance = await prisma.decision.groupBy({
        by: ['auditorId'],
        where: { createdAt: { gte: start, lte: end } },
        _count: true,
        _avg: { processingTime: true },
      });

      // Compliance metrics
      const compliance = {
        slaCompliance: await calculateSLACompliance(start, end),
        documentationCompliance: await calculateDocumentationCompliance(start, end),
        processCompliance: await calculateProcessCompliance(start, end),
      };

      // Risk analysis
      const risks = await identifyComplianceRisks(start, end);

      // Generate recommendations
      const recommendations = generateRecommendations(
        compliance,
        risks,
        aiAgreementRate[0]?.rate || 0
      );

      const report = {
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        statistics: {
          totalCases,
          totalDecisions,
          avgProcessingTime: avgProcessingTime._avg.processingTime || 0,
          aiAgreementRate: aiAgreementRate[0]?.rate || 0,
          appealRate: appealRate[0]?.rate || 0,
          fraudDetectionRate: fraudDetectionRate[0]?.rate || 0,
          decisionBreakdown,
        },
        compliance,
        risks,
        recommendations,
        generatedAt: new Date().toISOString(),
      };

      const result = {
        success: true,
        data: { report },
      };

      // Cache for 1 hour
      await cache.set(cacheKey, result, 3600);

      logAuditEvent('compliance.report.generated', req.user!.id, 'report', {
        startDate,
        endDate,
        reportType,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /audit/export:
 *   get:
 *     summary: Export audit data
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         required: true
 *         schema:
 *           type: string
 *           enum: [csv, json, pdf]
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dataType
 *         schema:
 *           type: string
 *           enum: [all, decisions, cases, appeals]
 *           default: all
 *     responses:
 *       200:
 *         description: Export file
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get(
  '/export',
  authorize('admin'),
  [
    query('format').isIn(['csv', 'json', 'pdf']),
    query('startDate').isISO8601(),
    query('endDate').isISO8601(),
    query('dataType').optional().isIn(['all', 'decisions', 'cases', 'appeals']),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { format, startDate, endDate, dataType = 'all' } = req.query;

      // Queue export job
      const job = await queues.analytics.add('export-audit-data', {
        format,
        startDate,
        endDate,
        dataType,
        requestedBy: req.user!.id,
      });

      logAuditEvent('audit.export.requested', req.user!.id, 'export', {
        format,
        startDate,
        endDate,
        dataType,
        jobId: job.id,
      });

      res.json({
        success: true,
        data: {
          jobId: job.id,
          message: 'Export job queued. You will receive a notification when ready.',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Helper functions
async function calculateSLACompliance(start: Date, end: Date): Promise<number> {
  const result = await prisma.$queryRaw<[{ compliance: number }]>`
    SELECT 
      CAST(COUNT(CASE WHEN processing_time <= 300 THEN 1 END) AS FLOAT) / 
      NULLIF(COUNT(*), 0) as compliance
    FROM decisions
    WHERE created_at BETWEEN ${start} AND ${end}
  `;
  return result[0]?.compliance || 0;
}

async function calculateDocumentationCompliance(start: Date, end: Date): Promise<number> {
  const result = await prisma.$queryRaw<[{ compliance: number }]>`
    SELECT 
      CAST(COUNT(CASE WHEN LENGTH(justification) >= 50 THEN 1 END) AS FLOAT) / 
      NULLIF(COUNT(*), 0) as compliance
    FROM decisions
    WHERE created_at BETWEEN ${start} AND ${end}
  `;
  return result[0]?.compliance || 0;
}

async function calculateProcessCompliance(start: Date, end: Date): Promise<number> {
  const result = await prisma.$queryRaw<[{ compliance: number }]>`
    SELECT 
      CAST(COUNT(CASE WHEN ai_recommendation IS NOT NULL THEN 1 END) AS FLOAT) / 
      NULLIF(COUNT(*), 0) as compliance
    FROM decisions
    WHERE created_at BETWEEN ${start} AND ${end}
  `;
  return result[0]?.compliance || 0;
}

async function identifyComplianceRisks(start: Date, end: Date): Promise<any[]> {
  const risks = [];

  // Check for rapid decisions (potential insufficient review)
  const rapidDecisions = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM decisions
    WHERE created_at BETWEEN ${start} AND ${end}
      AND processing_time < 60
  `;

  if (Number(rapidDecisions[0].count) > 0) {
    risks.push({
      type: 'rapid_decisions',
      severity: 'medium',
      count: Number(rapidDecisions[0].count),
      description: 'Decisions made in less than 1 minute may indicate insufficient review',
    });
  }

  // Check for high disagreement with AI
  const aiDisagreement = await prisma.$queryRaw<[{ rate: number }]>`
    SELECT 
      CAST(COUNT(CASE WHEN d.decision != d.ai_recommendation THEN 1 END) AS FLOAT) / 
      NULLIF(COUNT(*), 0) as rate
    FROM decisions d
    WHERE d.created_at BETWEEN ${start} AND ${end}
      AND d.ai_recommendation IS NOT NULL
  `;

  if (aiDisagreement[0]?.rate > 0.3) {
    risks.push({
      type: 'ai_disagreement',
      severity: 'high',
      rate: aiDisagreement[0].rate,
      description: 'High disagreement rate with AI recommendations may indicate inconsistent decision-making',
    });
  }

  return risks;
}

function generateRecommendations(
  compliance: any,
  risks: any[],
  aiAgreementRate: number
): string[] {
  const recommendations = [];

  if (compliance.slaCompliance < 0.95) {
    recommendations.push('Improve processing time to meet SLA targets of 5 minutes');
  }

  if (compliance.documentationCompliance < 0.9) {
    recommendations.push('Enhance decision justification documentation');
  }

  if (aiAgreementRate < 0.8) {
    recommendations.push('Review AI model accuracy and auditor training');
  }

  if (risks.some(r => r.type === 'rapid_decisions')) {
    recommendations.push('Implement minimum review time for complex cases');
  }

  return recommendations;
}

export { router as auditRoutes };