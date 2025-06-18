import { logger } from '../utils/logger';
import { startOfHour, startOfDay, startOfWeek, startOfMonth, endOfHour, endOfDay, endOfWeek, endOfMonth } from 'date-fns';
import * as cron from 'node-cron';
import { RedisService } from './redisService';

interface AggregationConfig {
  interval: 'hourly' | 'daily' | 'weekly' | 'monthly';
  metrics: string[];
  retentionDays: number;
}

export class DataAggregationService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  
  constructor(private redisService: RedisService) {}

  async startAggregation(config: AggregationConfig): Promise<void> {
    const cronExpression = this.getCronExpression(config.interval);
    
    const job = cron.schedule(cronExpression, async () => {
      await this.performAggregation(config);
    });

    this.jobs.set(config.interval, job);
    logger.info(`Started ${config.interval} aggregation job`);
  }

  async performAggregation(config: AggregationConfig): Promise<void> {
    try {
      const { startDate, endDate } = this.getDateRange(config.interval);
      
      // Aggregate different metrics
      const aggregationPromises = config.metrics.map(metric => 
        this.aggregateMetric(metric, startDate, endDate, config.interval)
      );

      await Promise.all(aggregationPromises);
      
      logger.info(`Completed ${config.interval} aggregation for period ${startDate} to ${endDate}`);
    } catch (error) {
      logger.error('Aggregation error:', error);
    }
  }

  private async aggregateMetric(
    metric: string, 
    startDate: Date, 
    endDate: Date, 
    interval: string
  ): Promise<void> {
    switch (metric) {
      case 'cases':
        await this.aggregateCaseMetrics(startDate, endDate, interval);
        break;
      case 'performance':
        await this.aggregatePerformanceMetrics(startDate, endDate, interval);
        break;
      case 'fraud':
        await this.aggregateFraudMetrics(startDate, endDate, interval);
        break;
      case 'ai':
        await this.aggregateAIMetrics(startDate, endDate, interval);
        break;
    }
  }

  private async aggregateCaseMetrics(startDate: Date, endDate: Date, interval: string): Promise<void> {
    // Mock aggregation - replace with actual database queries
    const aggregatedData = {
      interval,
      startDate,
      endDate,
      totalCases: Math.floor(Math.random() * 1000) + 500,
      approvedCases: Math.floor(Math.random() * 700) + 300,
      deniedCases: Math.floor(Math.random() * 200) + 100,
      avgProcessingTime: Math.random() * 5 + 2,
      medianProcessingTime: Math.random() * 4 + 2
    };

    const key = `aggregation:cases:${interval}:${startDate.getTime()}`;
    await this.redisService.set(key, JSON.stringify(aggregatedData), 7 * 24 * 60 * 60); // 7 days TTL
  }

  private async aggregatePerformanceMetrics(startDate: Date, endDate: Date, interval: string): Promise<void> {
    // Mock aggregation
    const performanceData = {
      interval,
      startDate,
      endDate,
      auditorMetrics: [
        {
          auditorId: '1',
          casesReviewed: Math.floor(Math.random() * 200) + 100,
          avgDecisionTime: Math.random() * 3 + 2,
          accuracy: Math.random() * 2 + 97
        }
      ],
      teamAverages: {
        avgCasesPerAuditor: 245,
        avgDecisionTime: 3.5,
        avgAccuracy: 98.2
      }
    };

    const key = `aggregation:performance:${interval}:${startDate.getTime()}`;
    await this.redisService.set(key, JSON.stringify(performanceData), 7 * 24 * 60 * 60);
  }

  private async aggregateFraudMetrics(startDate: Date, endDate: Date, interval: string): Promise<void> {
    // Mock aggregation
    const fraudData = {
      interval,
      startDate,
      endDate,
      totalDetections: Math.floor(Math.random() * 50) + 20,
      confirmedFrauds: Math.floor(Math.random() * 30) + 10,
      preventedLoss: Math.random() * 500000 + 100000,
      topPatterns: [
        { type: 'Billing Anomaly', count: 15 },
        { type: 'Duplicate Claims', count: 8 }
      ]
    };

    const key = `aggregation:fraud:${interval}:${startDate.getTime()}`;
    await this.redisService.set(key, JSON.stringify(fraudData), 7 * 24 * 60 * 60);
  }

  private async aggregateAIMetrics(startDate: Date, endDate: Date, interval: string): Promise<void> {
    // Mock aggregation
    const aiData = {
      interval,
      startDate,
      endDate,
      aiUsageRate: Math.random() * 10 + 80,
      avgConfidenceScore: Math.random() * 5 + 90,
      modelAccuracy: Math.random() * 1 + 98.5,
      processingTimeReduction: Math.random() * 10 + 75
    };

    const key = `aggregation:ai:${interval}:${startDate.getTime()}`;
    await this.redisService.set(key, JSON.stringify(aiData), 7 * 24 * 60 * 60);
  }

  private getCronExpression(interval: 'hourly' | 'daily' | 'weekly' | 'monthly'): string {
    switch (interval) {
      case 'hourly':
        return '0 * * * *'; // Every hour
      case 'daily':
        return '0 0 * * *'; // Every day at midnight
      case 'weekly':
        return '0 0 * * 0'; // Every Sunday at midnight
      case 'monthly':
        return '0 0 1 * *'; // First day of every month at midnight
    }
  }

  private getDateRange(interval: string): { startDate: Date; endDate: Date } {
    const now = new Date();
    
    switch (interval) {
      case 'hourly':
        return {
          startDate: startOfHour(now),
          endDate: endOfHour(now)
        };
      case 'daily':
        return {
          startDate: startOfDay(now),
          endDate: endOfDay(now)
        };
      case 'weekly':
        return {
          startDate: startOfWeek(now),
          endDate: endOfWeek(now)
        };
      case 'monthly':
        return {
          startDate: startOfMonth(now),
          endDate: endOfMonth(now)
        };
      default:
        return {
          startDate: startOfDay(now),
          endDate: endOfDay(now)
        };
    }
  }

  async stopAllJobs(): Promise<void> {
    this.jobs.forEach((job, interval) => {
      job.stop();
      logger.info(`Stopped ${interval} aggregation job`);
    });
    this.jobs.clear();
  }

  // Get aggregated data for a specific period
  async getAggregatedData(
    metric: string, 
    interval: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<any[]> {
    const results = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const key = `aggregation:${metric}:${interval}:${current.getTime()}`;
      const data = await this.redisService.get(key);
      
      if (data) {
        results.push(JSON.parse(data));
      }

      // Move to next interval
      switch (interval) {
        case 'hourly':
          current.setHours(current.getHours() + 1);
          break;
        case 'daily':
          current.setDate(current.getDate() + 1);
          break;
        case 'weekly':
          current.setDate(current.getDate() + 7);
          break;
        case 'monthly':
          current.setMonth(current.getMonth() + 1);
          break;
      }
    }

    return results;
  }
}