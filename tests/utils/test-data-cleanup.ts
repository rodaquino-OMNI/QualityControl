/**
 * Test Data Cleanup Utilities
 * Provides comprehensive cleanup and isolation for test environments
 */

import { Pool, PoolClient } from 'pg';
import { MongoClient, Db } from 'mongodb';
import Redis from 'ioredis';

export interface CleanupOptions {
  preserveBaseline: boolean;
  cleanupOrder: 'dependency' | 'reverse' | 'parallel';
  batchSize: number;
  logProgress: boolean;
  dryRun: boolean;
}

export interface CleanupStats {
  startTime: Date;
  endTime?: Date;
  tablesCleared: number;
  totalRecordsDeleted: number;
  recordsByTable: Map<string, number>;
  errors: string[];
}

export class TestDataCleanup {
  protected pgPool?: Pool;
  private mongoClient?: MongoClient;
  private redisClient?: Redis;
  private stats: CleanupStats;

  constructor() {
    this.stats = {
      startTime: new Date(),
      tablesCleared: 0,
      totalRecordsDeleted: 0,
      recordsByTable: new Map(),
      errors: []
    };
  }

  /**
   * Initialize database connections
   */
  async initialize(config: {
    postgres?: string;
    mongodb?: string;
    redis?: { host: string; port: number; db: number };
  }): Promise<void> {
    if (config.postgres) {
      this.pgPool = new Pool({ connectionString: config.postgres });
    }

    if (config.mongodb) {
      this.mongoClient = new MongoClient(config.mongodb);
      await this.mongoClient.connect();
    }

    if (config.redis) {
      this.redisClient = new Redis(config.redis);
    }
  }

  /**
   * Clean all test data across all databases
   */
  async cleanupAll(options: CleanupOptions = {
    preserveBaseline: false,
    cleanupOrder: 'dependency',
    batchSize: 1000,
    logProgress: true,
    dryRun: false
  }): Promise<CleanupStats> {
    this.stats.startTime = new Date();

    try {
      // Clean PostgreSQL
      if (this.pgPool) {
        await this.cleanupPostgreSQL(options);
      }

      // Clean MongoDB
      if (this.mongoClient) {
        await this.cleanupMongoDB(options);
      }

      // Clean Redis
      if (this.redisClient) {
        await this.cleanupRedis(options);
      }

      this.stats.endTime = new Date();
      
      if (options.logProgress) {
        this.logCleanupStats();
      }

      return this.stats;
    } catch (error) {
      this.stats.errors.push(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Clean PostgreSQL test data
   */
  private async cleanupPostgreSQL(options: CleanupOptions): Promise<void> {
    if (!this.pgPool) return;

    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      const cleanupOrder = this.getTableCleanupOrder(options.cleanupOrder);
      
      for (const table of cleanupOrder) {
        await this.cleanupTable(client, table, options);
      }

      if (!options.dryRun) {
        await client.query('COMMIT');
      } else {
        await client.query('ROLLBACK');
        console.log('🔍 Dry run completed - no changes made');
      }

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clean specific table with various strategies
   */
  private async cleanupTable(
    client: PoolClient, 
    tableName: string, 
    options: CleanupOptions
  ): Promise<void> {
    if (options.preserveBaseline && this.isBaselineTable(tableName)) {
      if (options.logProgress) {
        console.log(`⏭️  Skipping baseline table: ${tableName}`);
      }
      return;
    }

    try {
      // Get record count before cleanup
      const countResult = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
      const recordCount = parseInt(countResult.rows[0].count);

      if (recordCount === 0) {
        if (options.logProgress) {
          console.log(`✨ Table ${tableName} is already empty`);
        }
        return;
      }

      if (options.dryRun) {
        console.log(`🔍 Would delete ${recordCount} records from ${tableName}`);
        this.stats.recordsByTable.set(tableName, recordCount);
        this.stats.totalRecordsDeleted += recordCount;
        return;
      }

      // Choose cleanup strategy based on table size
      if (recordCount > options.batchSize * 10) {
        await this.batchDeleteTable(client, tableName, options.batchSize);
      } else {
        await client.query(`DELETE FROM ${tableName}`);
      }

      this.stats.recordsByTable.set(tableName, recordCount);
      this.stats.totalRecordsDeleted += recordCount;
      this.stats.tablesCleared++;

      if (options.logProgress) {
        console.log(`🧹 Cleaned ${tableName}: ${recordCount} records deleted`);
      }

    } catch (error) {
      const errorMsg = `Failed to clean table ${tableName}: ${error instanceof Error ? error.message : String(error)}`;
      this.stats.errors.push(errorMsg);
      if (options.logProgress) {
        console.error(`❌ ${errorMsg}`);
      }
    }
  }

  /**
   * Batch delete for large tables
   */
  private async batchDeleteTable(
    client: PoolClient, 
    tableName: string, 
    batchSize: number
  ): Promise<void> {
    let deletedCount = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await client.query(`
        DELETE FROM ${tableName} 
        WHERE id IN (
          SELECT id FROM ${tableName} 
          LIMIT $1
        )
      `, [batchSize]);

      const currentBatchCount = result.rowCount || 0;
      deletedCount += currentBatchCount;
      hasMore = currentBatchCount === batchSize;

      if (deletedCount % (batchSize * 10) === 0) {
        console.log(`  🔄 Deleted ${deletedCount} records from ${tableName}...`);
      }
    }
  }

  /**
   * Get table cleanup order based on foreign key dependencies
   */
  private getTableCleanupOrder(order: 'dependency' | 'reverse' | 'parallel'): string[] {
    const dependencyOrder = [
      // Analytics (no foreign keys to other schemas)
      'analytics.user_activity_summary',
      'analytics.provider_metrics', 
      'analytics.performance_metrics',
      
      // Audit (references other schemas but not vice versa)
      'audit.compliance_violations',
      'audit.decision_trails',
      'audit.activity_logs',
      
      // AI analysis results (references entities but not vice versa)
      'ai.fraud_detections',
      'ai.analysis_results',
      'ai.fraud_indicators',
      'ai.models',
      
      // Medical workflow (hierarchical dependencies)
      'medical.claims',
      'medical.authorization_decisions',
      'medical.authorization_requests',
      'medical.procedures',
      'medical.patients',
      
      // Auth (base dependencies)
      'auth.role_permissions',
      'auth.permissions',
      'auth.sessions',
      'auth.users',
      'auth.organizations'
    ];

    switch (order) {
      case 'dependency':
        return dependencyOrder;
      case 'reverse':
        return [...dependencyOrder].reverse();
      case 'parallel':
        // Group tables that can be cleaned in parallel
        return this.getParallelCleanupGroups().flat();
      default:
        return dependencyOrder;
    }
  }

  /**
   * Get tables grouped for parallel cleanup
   */
  private getParallelCleanupGroups(): string[][] {
    return [
      // Group 1: Analytics and logs (no dependencies)
      [
        'analytics.user_activity_summary',
        'analytics.provider_metrics', 
        'analytics.performance_metrics',
        'audit.activity_logs'
      ],
      
      // Group 2: AI results and compliance
      [
        'ai.fraud_detections',
        'ai.analysis_results',
        'audit.compliance_violations',
        'audit.decision_trails'
      ],
      
      // Group 3: AI models and fraud indicators
      [
        'ai.fraud_indicators',
        'ai.models'
      ],
      
      // Group 4: Medical claims and decisions
      [
        'medical.claims',
        'medical.authorization_decisions'
      ],
      
      // Group 5: Authorization requests
      ['medical.authorization_requests'],
      
      // Group 6: Procedures and patients
      [
        'medical.procedures',
        'medical.patients'
      ],
      
      // Group 7: Auth permissions
      [
        'auth.role_permissions',
        'auth.permissions',
        'auth.sessions'
      ],
      
      // Group 8: Users and organizations
      ['auth.users'],
      ['auth.organizations']
    ];
  }

  /**
   * Check if table contains baseline/seed data
   */
  private isBaselineTable(tableName: string): boolean {
    const baselineTables = [
      'auth.permissions',
      'medical.procedures', // Standard medical procedures
      'ai.models', // Core AI models
      'ai.fraud_indicators' // Standard fraud rules
    ];
    
    return baselineTables.includes(tableName);
  }

  /**
   * Clean MongoDB collections
   */
  private async cleanupMongoDB(options: CleanupOptions): Promise<void> {
    if (!this.mongoClient) return;

    const db = this.mongoClient.db();
    const collections = await db.listCollections().toArray();

    for (const collection of collections) {
      const collectionName = collection.name;
      
      if (options.preserveBaseline && this.isBaselineCollection(collectionName)) {
        continue;
      }

      try {
        const count = await db.collection(collectionName).countDocuments();
        
        if (count === 0) continue;

        if (options.dryRun) {
          console.log(`🔍 Would delete ${count} documents from ${collectionName}`);
          continue;
        }

        await db.collection(collectionName).deleteMany({});
        
        this.stats.recordsByTable.set(`mongodb.${collectionName}`, count);
        this.stats.totalRecordsDeleted += count;
        
        if (options.logProgress) {
          console.log(`🧹 Cleaned MongoDB collection ${collectionName}: ${count} documents`);
        }
      } catch (error) {
        this.stats.errors.push(`Failed to clean MongoDB collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Check if MongoDB collection contains baseline data
   */
  private isBaselineCollection(collectionName: string): boolean {
    const baselineCollections = [
      'system_config',
      'ai_model_definitions',
      'fraud_rule_templates'
    ];
    
    return baselineCollections.includes(collectionName);
  }

  /**
   * Clean Redis data
   */
  private async cleanupRedis(options: CleanupOptions): Promise<void> {
    if (!this.redisClient) return;

    try {
      const keys = await this.redisClient.keys('test:*');
      
      if (keys.length === 0) {
        if (options.logProgress) {
          console.log('✨ Redis test data is already clean');
        }
        return;
      }

      if (options.dryRun) {
        console.log(`🔍 Would delete ${keys.length} Redis keys`);
        return;
      }

      // Delete in batches to avoid blocking Redis
      const batches = this.chunkArray(keys, options.batchSize);
      
      for (const batch of batches) {
        await this.redisClient.del(...batch);
      }

      this.stats.recordsByTable.set('redis.test_keys', keys.length);
      this.stats.totalRecordsDeleted += keys.length;

      if (options.logProgress) {
        console.log(`🧹 Cleaned Redis: ${keys.length} test keys deleted`);
      }
    } catch (error) {
      this.stats.errors.push(`Failed to clean Redis: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Reset database sequences (PostgreSQL)
   */
  async resetSequences(): Promise<void> {
    if (!this.pgPool) return;

    const client = await this.pgPool.connect();
    
    try {
      // Get all sequences
      const sequences = await client.query(`
        SELECT schemaname, sequencename 
        FROM pg_sequences 
        WHERE schemaname IN ('auth', 'medical', 'ai', 'audit', 'analytics')
      `);

      for (const seq of sequences.rows) {
        await client.query(
          `ALTER SEQUENCE ${seq.schemaname}.${seq.sequencename} RESTART WITH 1`
        );
      }

      console.log(`🔄 Reset ${sequences.rows.length} database sequences`);
    } finally {
      client.release();
    }
  }

  /**
   * Vacuum and analyze tables after cleanup
   */
  async optimizeDatabase(): Promise<void> {
    if (!this.pgPool) return;

    const client = await this.pgPool.connect();
    
    try {
      console.log('🔧 Optimizing database...');
      
      // Vacuum and analyze all test tables
      const tables = this.getTableCleanupOrder('dependency');
      
      for (const table of tables) {
        await client.query(`VACUUM ANALYZE ${table}`);
      }

      console.log('✅ Database optimization completed');
    } finally {
      client.release();
    }
  }

  /**
   * Utility methods
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private logCleanupStats(): void {
    const duration = this.stats.endTime!.getTime() - this.stats.startTime.getTime();
    console.log('\n🧹 Cleanup Statistics:');
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📊 Total Records Deleted: ${this.stats.totalRecordsDeleted}`);
    console.log(`🗄️  Tables Cleared: ${this.stats.tablesCleared}`);
    
    if (this.stats.recordsByTable.size > 0) {
      console.log('\n📋 Records Deleted by Table:');
      for (const [table, count] of this.stats.recordsByTable.entries()) {
        console.log(`   ${table}: ${count}`);
      }
    }

    if (this.stats.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.stats.errors.forEach(error => console.log(`   ${error}`));
    }
  }

  /**
   * Disconnect from all databases
   */
  async disconnect(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
    }
    if (this.mongoClient) {
      await this.mongoClient.close();
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

// Advanced cleanup strategies
export class AdvancedTestDataCleanup extends TestDataCleanup {
  /**
   * Clean data by time range (useful for keeping recent test data)
   */
  async cleanupByTimeRange(
    tableName: string,
    olderThan: Date,
    options: CleanupOptions
  ): Promise<number> {
    if (!this.pgPool) throw new Error('PostgreSQL not initialized');

    const client = await this.pgPool.connect();
    
    try {
      const result = await client.query(`
        DELETE FROM ${tableName} 
        WHERE created_at < $1
      `, [olderThan]);

      const deletedCount = result.rowCount || 0;
      
      if (options.logProgress) {
        console.log(`🧹 Cleaned ${tableName}: ${deletedCount} records older than ${olderThan.toISOString()}`);
      }

      return deletedCount;
    } finally {
      client.release();
    }
  }

  /**
   * Clean data by test scope/tag
   */
  async cleanupByTestScope(
    testScope: string,
    options: CleanupOptions
  ): Promise<void> {
    // Implementation would depend on how test scopes are tracked
    // Could use metadata fields or separate tracking tables
  }

  /**
   * Selective cleanup preserving specific test scenarios
   */
  async selectiveCleanup(
    preserveIds: Set<string>,
    options: CleanupOptions
  ): Promise<void> {
    // Implementation for preserving specific test data while cleaning the rest
  }
}

// Export convenience functions
export const createCleanup = () => new TestDataCleanup();

export const cleanupTestData = async (
  config: {
    postgres?: string;
    mongodb?: string;
    redis?: { host: string; port: number; db: number };
  },
  options?: Partial<CleanupOptions>
): Promise<CleanupStats> => {
  const cleanup = new TestDataCleanup();
  
  try {
    await cleanup.initialize(config);
    return await cleanup.cleanupAll({
      preserveBaseline: false,
      cleanupOrder: 'dependency',
      batchSize: 1000,
      logProgress: true,
      dryRun: false,
      ...options
    });
  } finally {
    await cleanup.disconnect();
  }
};