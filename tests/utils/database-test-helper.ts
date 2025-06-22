/**
 * Database Test Helper for Multi-Database Operations
 */

import { PrismaClient } from '@prisma/client';
import { Db } from 'mongodb';
import Redis from 'ioredis';

export class DatabaseTestHelper {
  constructor(
    private prisma: PrismaClient,
    private mongodb: Db,
    private redis: Redis
  ) {}

  /**
   * Clear all MongoDB collections used in tests
   */
  async clearMongoCollections(): Promise<void> {
    const collections = [
      'audit_logs',
      'system_events', 
      'error_logs',
      'case_notes',
      'performance_metrics'
    ];

    for (const collectionName of collections) {
      try {
        await this.mongodb.collection(collectionName).deleteMany({});
      } catch (error) {
        // Collection might not exist, ignore error
        console.warn(`Warning: Could not clear collection ${collectionName}:`, error);
      }
    }
  }

  /**
   * Create test indexes for MongoDB collections
   */
  async createMongoIndexes(): Promise<void> {
    try {
      // Audit logs indexes
      await this.mongodb.collection('audit_logs').createIndexes([
        { key: { resourceId: 1, resourceType: 1 } },
        { key: { userId: 1 } },
        { key: { timestamp: -1 } },
        { key: { action: 1 } }
      ]);

      // System events indexes
      await this.mongodb.collection('system_events').createIndexes([
        { key: { userId: 1 } },
        { key: { eventType: 1 } },
        { key: { timestamp: -1 } }
      ]);

      // Error logs indexes
      await this.mongodb.collection('error_logs').createIndexes([
        { key: { timestamp: -1 } },
        { key: { errorType: 1 } },
        { key: { userId: 1 } }
      ]);

      // Case notes indexes
      await this.mongodb.collection('case_notes').createIndexes([
        { key: { caseId: 1 } },
        { key: { content: 'text' } },
        { key: { keywords: 1 } }
      ]);

      console.log('✅ MongoDB test indexes created');
    } catch (error) {
      console.warn('Warning: Could not create MongoDB indexes:', error);
    }
  }

  /**
   * Seed test audit log data
   */
  async seedAuditLogs(caseId: string, userId: string, actions: string[]): Promise<any[]> {
    const auditLogs = actions.map(action => ({
      resourceId: caseId,
      resourceType: 'case',
      action,
      userId,
      timestamp: new Date(),
      changes: { action: `Case ${action}` },
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent'
    }));

    const result = await this.mongodb.collection('audit_logs').insertMany(auditLogs);
    return Object.values(result.insertedIds);
  }

  /**
   * Seed test system events
   */
  async seedSystemEvents(userId: string, events: Array<{ type: string; metadata?: any }>): Promise<any[]> {
    const systemEvents = events.map(event => ({
      userId,
      eventType: event.type,
      timestamp: new Date(),
      metadata: {
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
        ...event.metadata
      }
    }));

    const result = await this.mongodb.collection('system_events').insertMany(systemEvents);
    return Object.values(result.insertedIds);
  }

  /**
   * Seed test error logs
   */
  async seedErrorLogs(userId: string, errors: Array<{ type: string; message: string; stack?: string }>): Promise<any[]> {
    const errorLogs = errors.map(error => ({
      userId,
      errorType: error.type,
      message: error.message,
      stack: error.stack || 'Test stack trace',
      timestamp: new Date(),
      metadata: {
        endpoint: '/api/test',
        method: 'GET',
        userAgent: 'test-agent'
      }
    }));

    const result = await this.mongodb.collection('error_logs').insertMany(errorLogs);
    return Object.values(result.insertedIds);
  }

  /**
   * Create test cache entries in Redis
   */
  async seedRedisCache(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    for (const entry of entries) {
      const serializedValue = typeof entry.value === 'string' 
        ? entry.value 
        : JSON.stringify(entry.value);
      
      if (entry.ttl) {
        await this.redis.setex(entry.key, entry.ttl, serializedValue);
      } else {
        await this.redis.set(entry.key, serializedValue);
      }
    }
  }

  /**
   * Create test session data in Redis
   */
  async createTestSession(sessionId: string, userId: string, data?: any): Promise<void> {
    const sessionData = {
      userId,
      email: 'test@example.com',
      role: 'auditor',
      loginTime: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      ...data
    };

    await this.redis.setex(`session:${sessionId}`, 3600, JSON.stringify(sessionData));
  }

  /**
   * Verify data consistency across databases
   */
  async verifyDataConsistency(caseId: string): Promise<{
    postgresql: any;
    mongodb: any[];
    redis: any;
  }> {
    // Get case from PostgreSQL
    const postgresqlCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        notes: true,
        attachments: true,
        assignedTo: true
      }
    });

    // Get audit logs from MongoDB
    const mongoAuditLogs = await this.mongodb.collection('audit_logs').find({
      resourceId: caseId,
      resourceType: 'case'
    }).toArray();

    // Get cached data from Redis
    const redisCacheKey = `case:${caseId}`;
    const redisData = await this.redis.get(redisCacheKey);
    const parsedRedisData = redisData ? JSON.parse(redisData) : null;

    return {
      postgresql: postgresqlCase,
      mongodb: mongoAuditLogs,
      redis: parsedRedisData
    };
  }

  /**
   * Simulate database connection failure
   */
  async simulatePostgreSQLFailure(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * Test database transaction rollback
   */
  async testTransactionRollback(caseId: string): Promise<{ success: boolean; error?: any }> {
    try {
      await this.prisma.$transaction(async (tx: any) => {
        // Update case
        await tx.case.update({
          where: { id: caseId },
          data: { status: 'test_transaction' }
        });

        // Add a note
        await tx.caseNote.create({
          data: {
            caseId,
            content: 'Transaction test note',
            type: 'test',
            createdById: 'test-user-id'
          }
        });

        // Force rollback by throwing error
        throw new Error('Forced rollback for testing');
      });

      return { success: false, error: 'Transaction should have rolled back' };
    } catch (error) {
      // Verify rollback occurred
      const case_ = await this.prisma.case.findUnique({ where: { id: caseId } });
      const notes = await this.prisma.caseNote.findMany({ where: { caseId } });
      
      const transactionNote = notes.find((note: any) => note.content === 'Transaction test note');
      
      if (case_?.status === 'test_transaction' || transactionNote) {
        return { success: false, error: 'Transaction rollback failed' };
      }

      return { success: true };
    }
  }

  /**
   * Performance test for database operations
   */
  async performanceTest(operations: number): Promise<{
    postgresql: { avgTime: number; operations: number };
    mongodb: { avgTime: number; operations: number };
    redis: { avgTime: number; operations: number };
  }> {
    // PostgreSQL performance test
    const pgStart = Date.now();
    for (let i = 0; i < operations; i++) {
      await this.prisma.user.findMany({ take: 1 });
    }
    const pgTime = Date.now() - pgStart;

    // MongoDB performance test
    const mongoStart = Date.now();
    for (let i = 0; i < operations; i++) {
      await this.mongodb.collection('audit_logs').findOne({});
    }
    const mongoTime = Date.now() - mongoStart;

    // Redis performance test
    const redisStart = Date.now();
    for (let i = 0; i < operations; i++) {
      await this.redis.get('test-key');
    }
    const redisTime = Date.now() - redisStart;

    return {
      postgresql: { avgTime: pgTime / operations, operations },
      mongodb: { avgTime: mongoTime / operations, operations },
      redis: { avgTime: redisTime / operations, operations }
    };
  }

  /**
   * Create test data across all databases
   */
  async createTestDataSet(userId: string, caseId: string): Promise<void> {
    // Create case in PostgreSQL
    await this.prisma.case.upsert({
      where: { id: caseId },
      update: {},
      create: {
        id: caseId,
        title: 'Cross-DB Test Case',
        description: 'Test case for multi-database operations',
        status: 'pending',
        priority: 'medium',
        assignedToId: userId
      }
    });

    // Create audit log in MongoDB
    await this.mongodb.collection('audit_logs').insertOne({
      resourceId: caseId,
      resourceType: 'case',
      action: 'created',
      userId,
      timestamp: new Date(),
      changes: { status: 'created' }
    });

    // Create cache entry in Redis
    await this.redis.setex(`case:${caseId}`, 3600, JSON.stringify({
      id: caseId,
      title: 'Cross-DB Test Case',
      cached_at: new Date().toISOString()
    }));
  }

  /**
   * Clean up all test data
   */
  async cleanupTestData(): Promise<void> {
    // Clear Redis test data
    const keys = await this.redis.keys('test:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    // Clear MongoDB test collections
    await this.clearMongoCollections();

    // PostgreSQL cleanup is handled by the main cleanup functions
  }

  /**
   * Get database health status
   */
  async getDatabaseHealth(): Promise<{
    postgresql: { status: string; version?: string };
    mongodb: { status: string; version?: string };
    redis: { status: string; version?: string };
  }> {
    const health = {
      postgresql: { status: 'unknown' },
      mongodb: { status: 'unknown' },
      redis: { status: 'unknown' }
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      health.postgresql.status = 'healthy';
    } catch (error) {
      health.postgresql.status = 'unhealthy';
    }

    try {
      await this.mongodb.admin().ping();
      health.mongodb.status = 'healthy';
    } catch (error) {
      health.mongodb.status = 'unhealthy';
    }

    try {
      await this.redis.ping();
      health.redis.status = 'healthy';
    } catch (error) {
      health.redis.status = 'unhealthy';
    }

    return health;
  }

  /**
   * Create test search data in MongoDB
   */
  async createSearchTestData(): Promise<void> {
    const testData = [
      {
        caseId: 'case1',
        content: 'Patient shows signs of diabetes complications with high glucose levels',
        keywords: ['diabetes', 'complications', 'glucose'],
        createdAt: new Date()
      },
      {
        caseId: 'case2', 
        content: 'Hypertension medication review required for elderly patient',
        keywords: ['hypertension', 'medication', 'elderly'],
        createdAt: new Date()
      },
      {
        caseId: 'case3',
        content: 'Cardiac assessment shows abnormal rhythm patterns',
        keywords: ['cardiac', 'rhythm', 'abnormal'],
        createdAt: new Date()
      }
    ];

    await this.mongodb.collection('case_notes').insertMany(testData);

    // Create text index for search
    try {
      await this.mongodb.collection('case_notes').createIndex({
        content: 'text',
        keywords: 'text'
      });
    } catch (error) {
      // Index might already exist
    }
  }
}