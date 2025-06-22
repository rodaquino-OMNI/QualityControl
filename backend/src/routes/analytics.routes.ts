import { Router, Request, Response, NextFunction } from 'express';
const { query, validationResult } = require('express-validator');
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { logAuditEvent } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { queues } from '../config/queues';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /analytics/dashboard:
 *   get:
 *     summary: Get dashboard metrics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, week, month, quarter, year]
 *           default: month
 *     responses:
 *       200:
 *         description: Dashboard metrics
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
 *                     overview:
 *                       type: object
 *                     performance:
 *                       type: object
 *                     trends:
 *                       type: object
 *                     alerts:
 *                       type: array
 */
router.get(
  '/dashboard',
  [query('period').optional().isIn(['today', 'week', 'month', 'quarter', 'year'])],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { period = 'month' } = req.query;

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      switch (period) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }

      // Check cache
      const cacheKey = `analytics:dashboard:${period}:${startDate.toISOString()}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      // Get overview metrics
      const [
        totalCases,
        pendingCases,
        totalDecisions,
        avgProcessingTime,
        totalValue,
        approvalRate,
      ] = await Promise.all([
        prisma.case.count({
          where: { createdAt: { gte: startDate, lte: endDate } },
        }),
        prisma.case.count({
          where: { status: 'open' },
        }),
        prisma.authorizationDecision.count({
          where: { createdAt: { gte: startDate, lte: endDate } },
        }),
        prisma.authorizationDecision.aggregate({
          where: { createdAt: { gte: startDate, lte: endDate } },
          _avg: { processingTime: true } as any,
        }),
        prisma.case.aggregate({
          where: { createdAt: { gte: startDate, lte: endDate } },
          _count: true,
        }),
        prisma.$queryRaw<[{ rate: number }]>`
          SELECT 
            CAST(COUNT(CASE WHEN decision = 'approved' THEN 1 END) AS FLOAT) / 
            NULLIF(COUNT(*), 0) as rate
          FROM decisions
          WHERE created_at BETWEEN ${startDate} AND ${endDate}
        `,
      ]);

      // Get performance metrics by auditor
      const auditorPerformance = await prisma.$queryRaw<any[]>`
        SELECT 
          u.id,
          u.name,
          COUNT(d.id) as total_decisions,
          AVG(d.processing_time) as avg_processing_time,
          COUNT(CASE WHEN d.decision = d.ai_recommendation THEN 1 END)::FLOAT / 
            NULLIF(COUNT(CASE WHEN d.ai_recommendation IS NOT NULL THEN 1 END), 0) as ai_agreement_rate
        FROM users u
        INNER JOIN decisions d ON d.auditor_id = u.id
        WHERE d.created_at BETWEEN ${startDate} AND ${endDate}
        GROUP BY u.id, u.name
        ORDER BY total_decisions DESC
        LIMIT 10
      `;

      // Get trends data
      const trendsData = await getTrendsData(startDate, endDate, period as string);

      // Get active alerts
      const alerts = await prisma.notification.findMany({
        where: {
          createdAt: { gte: startDate },
          isRead: false,
          type: 'CASE_UPDATE' as any,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const result = {
        success: true,
        data: {
          overview: {
            totalCases,
            pendingCases,
            totalDecisions,
            avgProcessingTime: (avgProcessingTime as any)._avg?.processingTime || 0,
            totalValue: totalValue._count || 0,
            approvalRate: approvalRate[0]?.rate || 0,
          },
          performance: {
            auditors: auditorPerformance,
          },
          trends: trendsData,
          alerts,
        },
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, result, 300);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /analytics/metrics/auditor:
 *   get:
 *     summary: Get auditor performance metrics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: auditorId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Auditor metrics
 */
router.get(
  '/metrics/auditor',
  [
    query('auditorId').optional().isUUID(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { auditorId, startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      const whereClause = {
        createdAt: { gte: start, lte: end },
        ...(auditorId ? { auditorId: auditorId as string } : {}),
      };

      // Get metrics
      const metrics = await prisma.authorizationDecision.aggregate({
        where: whereClause,
        _count: true,
        _avg: {
          processingTime: true,
          aiConfidence: true,
        },
      });

      // Get decision breakdown
      const decisionBreakdown = await prisma.authorizationDecision.groupBy({
        by: ['decision'],
        where: whereClause,
        _count: true,
      });

      // Get AI agreement rate
      const aiAgreement = await prisma.$queryRaw<[{ agreementRate: number }]>`
        SELECT 
          CAST(COUNT(CASE WHEN decision = ai_recommendation THEN 1 END) AS FLOAT) / 
          NULLIF(COUNT(CASE WHEN ai_recommendation IS NOT NULL THEN 1 END), 0) as agreementRate
        FROM decisions
        WHERE created_at BETWEEN ${start} AND ${end}
          ${auditorId ? `AND auditor_id = ${auditorId}` : ''}
      `;

      // Get hourly distribution
      const hourlyDistribution = await prisma.$queryRaw<any[]>`
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as count
        FROM decisions
        WHERE created_at BETWEEN ${start} AND ${end}
          ${auditorId ? `AND auditor_id = ${auditorId}` : ''}
        GROUP BY hour
        ORDER BY hour
      `;

      res.json({
        success: true,
        data: {
          metrics: {
            totalDecisions: metrics._count,
            avgProcessingTime: metrics._avg.processingTime || 0,
            avgAIConfidence: metrics._avg.aiConfidence || 0,
            aiAgreementRate: aiAgreement[0]?.agreementRate || 0,
          },
          decisionBreakdown,
          hourlyDistribution,
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /analytics/fraud-analysis:
 *   get:
 *     summary: Get fraud detection analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Fraud analytics
 */
router.get(
  '/fraud-analysis',
  authorize('admin', 'auditor'),
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      // Get fraud statistics
      const fraudStats = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*) as total_cases,
          COUNT(CASE WHEN fraud_score > 0.3 THEN 1 END) as suspicious_cases,
          COUNT(CASE WHEN fraud_score > 0.7 THEN 1 END) as high_risk_cases,
          AVG(fraud_score) as avg_fraud_score,
          MAX(fraud_score) as max_fraud_score
        FROM cases
        WHERE created_at BETWEEN ${start} AND ${end}
          AND fraud_score IS NOT NULL
      `;

      // Get top fraud indicators
      const topIndicators = await prisma.$queryRaw<any[]>`
        SELECT 
          jsonb_array_elements(indicators)->'type' as indicator_type,
          COUNT(*) as count,
          AVG(score) as avg_score
        FROM fraud_detections
        WHERE created_at BETWEEN ${start} AND ${end}
        GROUP BY indicator_type
        ORDER BY count DESC
        LIMIT 10
      `;

      // Get fraud trends
      const fraudTrends = await prisma.$queryRaw<any[]>`
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          AVG(fraud_score) as avg_score,
          COUNT(CASE WHEN fraud_score > 0.7 THEN 1 END) as high_risk_count
        FROM cases
        WHERE created_at BETWEEN ${start} AND ${end}
          AND fraud_score IS NOT NULL
        GROUP BY date
        ORDER BY date
      `;

      // Get provider fraud risk
      const providerRisk = await prisma.$queryRaw<any[]>`
        SELECT 
          p.provider_id,
          p.name as provider_name,
          COUNT(c.id) as total_cases,
          AVG(c.fraud_score) as avg_fraud_score,
          COUNT(CASE WHEN c.fraud_score > 0.7 THEN 1 END) as high_risk_cases
        FROM cases c
        INNER JOIN patients p ON p.id = c.patient_id
        WHERE c.created_at BETWEEN ${start} AND ${end}
          AND c.fraud_score IS NOT NULL
        GROUP BY p.provider_id, p.name
        HAVING COUNT(c.id) > 5
        ORDER BY avg_fraud_score DESC
        LIMIT 20
      `;

      res.json({
        success: true,
        data: {
          statistics: fraudStats[0] || {},
          topIndicators,
          trends: fraudTrends,
          providerRisk,
          period: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /analytics/reports/generate:
 *   post:
 *     summary: Generate custom analytics report
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reportType
 *               - startDate
 *               - endDate
 *             properties:
 *               reportType:
 *                 type: string
 *                 enum: [performance, compliance, fraud, financial]
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               filters:
 *                 type: object
 *               format:
 *                 type: string
 *                 enum: [pdf, excel, csv]
 *                 default: pdf
 *     responses:
 *       202:
 *         description: Report generation queued
 */
router.post(
  '/reports/generate',
  authorize('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reportType, startDate, endDate, filters = {}, format = 'pdf' } = req.body;

      // Queue report generation
      const job = await queues.analytics.add('generate-report', {
        reportType,
        startDate,
        endDate,
        filters,
        format,
        requestedBy: req.user!.id,
      });

      logAuditEvent('analytics.report.requested', req.user!.id, 'report', {
        reportType,
        startDate,
        endDate,
        format,
        jobId: job.id,
      });

      res.status(202).json({
        success: true,
        data: {
          jobId: job.id,
          message: 'Report generation queued. You will be notified when ready.',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Helper function to get trends data
async function getTrendsData(startDate: Date, endDate: Date, period: string) {
  let dateFormat: string;
  switch (period) {
    case 'today':
      dateFormat = 'hour';
      break;
    case 'week':
      dateFormat = 'day';
      break;
    case 'month':
      dateFormat = 'day';
      break;
    case 'quarter':
      dateFormat = 'week';
      break;
    case 'year':
      dateFormat = 'month';
      break;
    default:
      dateFormat = 'day';
  }

  const trends = await prisma.$queryRaw<any[]>`
    SELECT 
      DATE_TRUNC(${dateFormat}, c.created_at) as date,
      COUNT(c.id) as cases_created,
      COUNT(d.id) as decisions_made,
      AVG(d.processing_time) as avg_processing_time,
      SUM(c.value) as total_value
    FROM cases c
    LEFT JOIN decisions d ON d.case_id = c.id
    WHERE c.created_at BETWEEN ${startDate} AND ${endDate}
    GROUP BY date
    ORDER BY date
  `;

  return trends;
}

export { router as analyticsRoutes };