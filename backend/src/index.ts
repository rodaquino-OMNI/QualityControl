import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { createApp } from './app';
import { RedisService } from './services/redisService';
import { DataAggregationService } from './services/dataAggregationService';

// Load environment variables
dotenv.config();

// Create app instance for production
const app = createApp();
const PORT = process.env.PORT || 3001;

// Initialize services for production
const redisService = new RedisService();
const aggregationService = new DataAggregationService(redisService);

// Start aggregation jobs
const startAggregationJobs = async () => {
  try {
    await aggregationService.startAggregation({
      interval: 'hourly',
      metrics: ['cases', 'performance', 'fraud', 'ai'],
      retentionDays: 7
    });

    await aggregationService.startAggregation({
      interval: 'daily',
      metrics: ['cases', 'performance', 'fraud', 'ai'],
      retentionDays: 30
    });

    logger.info('Data aggregation jobs started successfully');
  } catch (error) {
    logger.error('Failed to start aggregation jobs:', error);
  }
};

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Start background jobs
  startAggregationJobs();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  server.close(() => {
    logger.info('Server closed');
    
    // Stop aggregation jobs
    aggregationService.stopAllJobs().then(() => {
      logger.info('Aggregation jobs stopped');
      
      // Disconnect from Redis
      redisService.disconnect().then(() => {
        logger.info('Redis disconnected');
        process.exit(0);
      });
    });
  });
});

// Export app instance for testing

export default app;