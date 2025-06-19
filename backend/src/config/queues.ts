import Bull from 'bull';
import { redis } from './redis';
import { logger } from '../utils/logger';

// Queue configurations
const defaultJobOptions = {
  removeOnComplete: true,
  removeOnFail: false,
  attempts: parseInt(process.env.QUEUE_MAX_RETRIES || '3'),
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
};

// Create queues
export const queues = {
  aIAnalysis: new Bull('ai-analysis', {
    redis: process.env.REDIS_URL || 'redis://localhost:6379',
    defaultJobOptions,
  }),
  
  notifications: new Bull('notifications', {
    redis: process.env.REDIS_URL || 'redis://localhost:6379',
    defaultJobOptions,
  }),
  
  analytics: new Bull('analytics', {
    redis: process.env.REDIS_URL || 'redis://localhost:6379',
    defaultJobOptions,
  }),
  
  auditLog: new Bull('audit-log', {
    redis: process.env.REDIS_URL || 'redis://localhost:6379',
    defaultJobOptions,
  }),
  
  fraudDetection: new Bull('fraud-detection', {
    redis: process.env.REDIS_URL || 'redis://localhost:6379',
    defaultJobOptions,
  }),
};

// Queue event handlers
export function setupQueues() {
  Object.entries(queues).forEach(([name, queue]) => {
    queue.on('completed', (job, result) => {
      logger.info(`Job ${job.id} in queue ${name} completed`);
    });

    queue.on('failed', (job, err) => {
      logger.error(`Job ${job?.id} in queue ${name} failed:`, err);
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job ${job?.id} in queue ${name} stalled`);
    });

    queue.on('error', (error) => {
      logger.error(`Queue ${name} error:`, error);
    });
  });

  logger.info('All queues initialized successfully');
}

// Queue utilities
export const queueUtils = {
  async getQueueStatus(queueName: keyof typeof queues) {
    const queue = queues[queueName];
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      name: queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  },

  async getAllQueuesStatus() {
    const statuses = await Promise.all(
      Object.keys(queues).map((queueName) =>
        this.getQueueStatus(queueName as keyof typeof queues)
      )
    );
    return statuses;
  },

  async cleanQueue(queueName: keyof typeof queues) {
    const queue = queues[queueName];
    await queue.clean(0, 'completed');
    await queue.clean(0, 'failed');
    logger.info(`Queue ${queueName} cleaned`);
  },

  async pauseQueue(queueName: keyof typeof queues) {
    const queue = queues[queueName];
    await queue.pause();
    logger.info(`Queue ${queueName} paused`);
  },

  async resumeQueue(queueName: keyof typeof queues) {
    const queue = queues[queueName];
    await queue.resume();
    logger.info(`Queue ${queueName} resumed`);
  },
};