import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { logger, logSecurityEvent } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { RedisService } from '../services/redisService';

const router = Router();
const redisService = new RedisService();

// Rate limiting for error reporting
const ERROR_REPORT_LIMIT = 100; // Max errors per IP per hour
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds

/**
 * @swagger
 * /errors/frontend:
 *   post:
 *     summary: Report frontend errors
 *     tags: [Errors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - error
 *               - url
 *               - userAgent
 *               - timestamp
 *             properties:
 *               error:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   message:
 *                     type: string
 *                   stack:
 *                     type: string
 *               componentStack:
 *                 type: string
 *               url:
 *                 type: string
 *               userAgent:
 *                 type: string
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *               retryCount:
 *                 type: integer
 *               userId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Error reported successfully
 *       400:
 *         description: Validation error
 *       429:
 *         description: Rate limit exceeded
 */
router.post(
  '/frontend',
  [
    body('error').isObject().notEmpty(),
    body('error.name').isString().notEmpty(),
    body('error.message').isString().notEmpty(),
    body('url').isURL(),
    body('userAgent').isString().notEmpty(),
    body('timestamp').isISO8601(),
    body('componentStack').optional().isString(),
    body('retryCount').optional().isInt({ min: 0 }),
    body('userId').optional().isString(),
    body('sessionId').optional().isString(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
      
      // Rate limiting
      const rateLimitKey = `frontend_error_limit:${clientIP}`;
      const currentCount = await redisService.get(rateLimitKey);
      
      if (currentCount && parseInt(currentCount) >= ERROR_REPORT_LIMIT) {
        logSecurityEvent(
          'RATE_LIMIT_EXCEEDED',
          'medium',
          'Frontend error reporting rate limit exceeded',
          {
            ip: clientIP,
            userAgent: req.get('user-agent'),
            limit: ERROR_REPORT_LIMIT,
            window: RATE_LIMIT_WINDOW,
          }
        );
        
        throw new AppError(
          'Rate limit exceeded for error reporting',
          429,
          'RATE_LIMIT_EXCEEDED'
        );
      }

      // Increment rate limit counter
      await redisService.setex(
        rateLimitKey,
        RATE_LIMIT_WINDOW,
        (parseInt(currentCount || '0') + 1).toString()
      );

      const {
        error: frontendError,
        componentStack,
        url,
        userAgent,
        timestamp,
        retryCount = 0,
        userId,
        sessionId,
      } = req.body;

      // Sanitize and validate error data
      const sanitizedError = {
        name: frontendError.name.substring(0, 200),
        message: frontendError.message.substring(0, 1000),
        stack: frontendError.stack ? frontendError.stack.substring(0, 5000) : null,
      };

      // Check for suspicious patterns
      const suspiciousPatterns = [
        /script/i,
        /eval\(/i,
        /document\.cookie/i,
        /localStorage/i,
        /sessionStorage/i,
        /<script/i,
        /javascript:/i,
      ];

      const isSuspicious = suspiciousPatterns.some(pattern => 
        pattern.test(sanitizedError.message) || 
        pattern.test(sanitizedError.stack || '')
      );

      if (isSuspicious) {
        logSecurityEvent(
          'SUSPICIOUS_FRONTEND_ERROR',
          'high',
          'Potentially malicious frontend error report detected',
          {
            ip: clientIP,
            userAgent,
            error: sanitizedError,
            url,
            userId,
          }
        );
      }

      // Log the frontend error
      logger.error('Frontend Error Report', {
        error: sanitizedError,
        frontend: {
          url,
          userAgent,
          timestamp,
          componentStack: componentStack ? componentStack.substring(0, 2000) : null,
          retryCount,
          sessionId,
        },
        user: {
          id: userId,
          ip: clientIP,
        },
        metadata: {
          reportedAt: new Date().toISOString(),
          isSuspicious,
        },
      });

      // Store aggregated error metrics
      await storeErrorMetrics(sanitizedError, {
        url,
        userAgent,
        userId,
        retryCount,
        isSuspicious,
      });

      res.status(201).json({
        success: true,
        message: 'Error reported successfully',
        id: generateErrorId(),
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /errors/metrics:
 *   get:
 *     summary: Get frontend error metrics
 *     tags: [Errors]
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *     responses:
 *       200:
 *         description: Error metrics
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
 *                     totalErrors:
 *                       type: integer
 *                     errorsByType:
 *                       type: object
 *                     errorsByPage:
 *                       type: object
 *                     errorTrends:
 *                       type: array
 */
router.get(
  '/metrics',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const timeframe = req.query.timeframe as string || 'day';
      const metrics = await getErrorMetrics(timeframe);

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Helper functions

function generateErrorId(): string {
  return `fe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function storeErrorMetrics(
  error: { name: string; message: string; stack: string | null },
  metadata: {
    url: string;
    userAgent: string;
    userId?: string;
    retryCount: number;
    isSuspicious: boolean;
  }
): Promise<void> {
  try {
    const hour = new Date().getHours();
    const day = new Date().toISOString().split('T')[0];
    
    // Store hourly metrics
    const hourlyKey = `frontend_errors:hourly:${day}:${hour}`;
    await redisService.hincrby(hourlyKey, 'total', 1);
    await redisService.hincrby(hourlyKey, `type:${error.name}`, 1);
    await redisService.expire(hourlyKey, 7 * 24 * 3600); // 7 days

    // Store daily metrics
    const dailyKey = `frontend_errors:daily:${day}`;
    await redisService.hincrby(dailyKey, 'total', 1);
    await redisService.hincrby(dailyKey, `type:${error.name}`, 1);
    await redisService.expire(dailyKey, 30 * 24 * 3600); // 30 days

    // Store page-specific metrics
    const pageUrl = new URL(metadata.url).pathname;
    const pageKey = `frontend_errors:page:${day}`;
    await redisService.hincrby(pageKey, pageUrl, 1);
    await redisService.expire(pageKey, 7 * 24 * 3600); // 7 days

    // Store suspicious errors separately
    if (metadata.isSuspicious) {
      const suspiciousKey = `frontend_errors:suspicious:${day}`;
      await redisService.hincrby(suspiciousKey, 'total', 1);
      await redisService.expire(suspiciousKey, 30 * 24 * 3600); // 30 days
    }

  } catch (storageError) {
    logger.error('Failed to store error metrics', { error: storageError });
  }
}

async function getErrorMetrics(timeframe: string): Promise<object> {
  try {
    const now = new Date();
    const metrics: any = {
      totalErrors: 0,
      errorsByType: {},
      errorsByPage: {},
      errorTrends: [],
    };

    switch (timeframe) {
      case 'hour':
        const currentHour = now.getHours();
        const today = now.toISOString().split('T')[0];
        const hourlyKey = `frontend_errors:hourly:${today}:${currentHour}`;
        const hourlyData = await redisService.hgetall(hourlyKey);
        
        if (hourlyData) {
          metrics.totalErrors = parseInt(hourlyData.total || '0');
          
          for (const [key, value] of Object.entries(hourlyData)) {
            if (key.startsWith('type:')) {
              const errorType = key.substring(5);
              metrics.errorsByType[errorType] = parseInt(value as string);
            }
          }
        }
        break;

      case 'day':
        const dayKey = `frontend_errors:daily:${now.toISOString().split('T')[0]}`;
        const dailyData = await redisService.hgetall(dayKey);
        
        if (dailyData) {
          metrics.totalErrors = parseInt(dailyData.total || '0');
          
          for (const [key, value] of Object.entries(dailyData)) {
            if (key.startsWith('type:')) {
              const errorType = key.substring(5);
              metrics.errorsByType[errorType] = parseInt(value as string);
            }
          }
        }

        // Get page metrics
        const pageKey = `frontend_errors:page:${now.toISOString().split('T')[0]}`;
        const pageData = await redisService.hgetall(pageKey);
        if (pageData) {
          metrics.errorsByPage = pageData;
        }
        break;

      case 'week':
      case 'month':
        // Aggregate multiple days
        const days = timeframe === 'week' ? 7 : 30;
        
        for (let i = 0; i < days; i++) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          
          const dayData = await redisService.hgetall(`frontend_errors:daily:${dateStr}`);
          if (dayData) {
            metrics.totalErrors += parseInt(dayData.total || '0');
            
            for (const [key, value] of Object.entries(dayData)) {
              if (key.startsWith('type:')) {
                const errorType = key.substring(5);
                metrics.errorsByType[errorType] = 
                  (metrics.errorsByType[errorType] || 0) + parseInt(value as string);
              }
            }
          }
        }
        break;
    }

    return metrics;
  } catch (error) {
    logger.error('Failed to get error metrics', { error });
    return {
      totalErrors: 0,
      errorsByType: {},
      errorsByPage: {},
      errorTrends: [],
    };
  }
}

export { router as errorRoutes };