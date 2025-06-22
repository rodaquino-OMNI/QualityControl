import { Router, Request, Response, NextFunction } from 'express';
const { body, query, param, validationResult } = require('express-validator');
import { prisma } from '../config/database';
import { queues } from '../config/queues';
import { logger, logAuditEvent } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get user notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [unread, read, all]
 *           default: all
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [case_assigned, decision_made, appeal_created, alert, system]
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
 *         description: List of notifications
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
 *                     notifications:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           type:
 *                             type: string
 *                           title:
 *                             type: string
 *                           message:
 *                             type: string
 *                           data:
 *                             type: object
 *                           read:
 *                             type: boolean
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                 meta:
 *                   type: object
 */
router.get(
  '/',
  [
    query('status').optional().isIn(['unread', 'read', 'all']),
    query('type').optional().isIn(['case_assigned', 'decision_made', 'appeal_created', 'alert', 'system']),
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
        status = 'all',
        type,
        page = 1,
        limit = 20,
      } = req.query;

      // Build filter
      const where: any = {
        userId: req.user!.id,
      };

      if (status === 'unread') {
        where.read = false;
      } else if (status === 'read') {
        where.read = true;
      }

      if (type) {
        where.type = type;
      }

      // Get notifications
      const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          skip: ((page as number) - 1) * (limit as number),
          take: limit as number,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({
          where: {
            userId: req.user!.id,
            read: false,
          },
        }),
      ]);

      res.json({
        success: true,
        data: { notifications },
        meta: {
          page: page as number,
          limit: limit as number,
          total,
          totalPages: Math.ceil(total / (limit as number)),
          unreadCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     tags: [Notifications]
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
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 */
router.patch(
  '/:id/read',
  [param('id').isUUID()],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { id } = req.params;

      const notification = await prisma.notification.updateMany({
        where: {
          id,
          userId: req.user!.id,
        },
        data: {
          read: true,
          readAt: new Date(),
        },
      });

      if (notification.count === 0) {
        throw new AppError('Notification not found', 404, 'NOTIFICATION_NOT_FOUND');
      }

      res.json({
        success: true,
        message: 'Notification marked as read',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.patch(
  '/read-all',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await prisma.notification.updateMany({
        where: {
          userId: req.user!.id,
          read: false,
        },
        data: {
          read: true,
          readAt: new Date(),
        },
      });

      res.json({
        success: true,
        message: `${updated.count} notifications marked as read`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /notifications/preferences:
 *   get:
 *     summary: Get notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification preferences
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
 *                     preferences:
 *                       type: object
 *                       properties:
 *                         email:
 *                           type: object
 *                         push:
 *                           type: object
 *                         sms:
 *                           type: object
 */
router.get(
  '/preferences',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const preferences = await prisma.notificationPreference.findUnique({
        where: { userId: req.user!.id },
      });

      if (!preferences) {
        // Return default preferences
        res.json({
          success: true,
          data: {
            preferences: {
              email: {
                caseAssigned: true,
                decisionMade: true,
                appealCreated: true,
                alerts: true,
                dailyDigest: false,
              },
              push: {
                caseAssigned: true,
                decisionMade: true,
                appealCreated: true,
                alerts: true,
              },
              sms: {
                urgentOnly: true,
                alerts: true,
              },
            },
          },
        });
        return;
      }

      res.json({
        success: true,
        data: { preferences },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /notifications/preferences:
 *   put:
 *     summary: Update notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: object
 *               push:
 *                 type: object
 *               sms:
 *                 type: object
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 */
router.put(
  '/preferences',
  [
    body('email').optional().isObject(),
    body('push').optional().isObject(),
    body('sms').optional().isObject(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { email, push, sms } = req.body;

      const preferences = await prisma.notificationPreference.upsert({
        where: { userId: req.user!.id },
        update: {
          email,
          push,
          sms,
          updatedAt: new Date(),
        },
        create: {
          userId: req.user!.id,
          email,
          push,
          sms,
        },
      });

      logAuditEvent('notification.preferences.updated', req.user!.id, req.user!.id, {
        email,
        push,
        sms,
      });

      res.json({
        success: true,
        data: { preferences },
        message: 'Preferences updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /notifications/send:
 *   post:
 *     summary: Send notification (admin only)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipients
 *               - title
 *               - message
 *             properties:
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [system, alert]
 *                 default: system
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *                 default: medium
 *               channels:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [in-app, email, push, sms]
 *     responses:
 *       202:
 *         description: Notifications queued for sending
 */
router.post(
  '/send',
  [
    body('recipients').isArray().notEmpty(),
    body('recipients.*').isUUID(),
    body('title').notEmpty().trim(),
    body('message').notEmpty().trim(),
    body('type').optional().isIn(['system', 'alert']),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    body('channels').optional().isArray(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const {
        recipients,
        title,
        message,
        type = 'system',
        priority = 'medium',
        channels = ['in-app'],
      } = req.body;

      // Create in-app notifications
      const notifications = await prisma.notification.createMany({
        data: recipients.map((userId: string) => ({
          userId,
          type,
          title,
          message,
          priority,
          data: {
            sentBy: req.user!.id,
            channels,
          },
        })),
      });

      // Queue other channel notifications
      if (channels.includes('email') || channels.includes('push') || channels.includes('sms')) {
        for (const userId of recipients) {
          await queues.notifications.add('send-notification', {
            userId,
            title,
            message,
            type,
            priority,
            channels: channels.filter((c: string) => c !== 'in-app'),
          }, {
            priority: priority === 'high' ? 1 : priority === 'medium' ? 2 : 3,
          });
        }
      }

      logAuditEvent('notification.bulk.sent', req.user!.id, 'bulk-notification', {
        recipientCount: recipients.length,
        type,
        channels,
      });

      res.status(202).json({
        success: true,
        data: {
          recipientCount: recipients.length,
          notificationCount: notifications.count,
        },
        message: 'Notifications queued for sending',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /notifications/test:
 *   post:
 *     summary: Send test notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - channel
 *             properties:
 *               channel:
 *                 type: string
 *                 enum: [email, push, sms]
 *     responses:
 *       200:
 *         description: Test notification sent
 */
router.post(
  '/test',
  [body('channel').isIn(['email', 'push', 'sms'])],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { channel } = req.body;

      // Queue test notification
      await queues.notifications.add('send-test-notification', {
        userId: req.user!.id,
        channel,
      });

      res.json({
        success: true,
        message: `Test ${channel} notification sent`,
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as notificationRoutes };