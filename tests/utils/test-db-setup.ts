/**
 * Database Setup Utilities for Integration Tests
 */

import { PrismaClient } from '@prisma/client';
import { MongoClient, Db } from 'mongodb';
import Redis from 'ioredis';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DatabaseTestSetup {
  private static prisma: PrismaClient;
  private static mongoClient: MongoClient;
  private static redisClient: Redis;

  static async setupTestDatabase(): Promise<PrismaClient> {
    if (!this.prisma) {
      // Create new Prisma client for testing
      this.prisma = new PrismaClient({
        datasources: {
          db: {
            url: process.env.DATABASE_TEST_URL || 'postgresql://test:test@localhost:5433/austa_test'
          }
        }
      });

      // Connect to the database
      await this.prisma.$connect();

      // Run migrations
      await this.runMigrations();

      // Seed basic test data
      await this.seedBasicData();
    }

    return this.prisma;
  }

  static async setupTestMongoDB(): Promise<Db> {
    if (!this.mongoClient) {
      const mongoUrl = process.env.MONGODB_TEST_URL || 'mongodb://localhost:27017';
      this.mongoClient = new MongoClient(mongoUrl);
      await this.mongoClient.connect();
    }

    const db = this.mongoClient.db('austa_test_logs');
    
    // Create collections and indexes
    await this.createMongoCollections(db);
    
    return db;
  }

  static async setupTestRedis(): Promise<Redis> {
    if (!this.redisClient) {
      this.redisClient = new Redis({
        host: process.env.REDIS_TEST_HOST || 'localhost',
        port: parseInt(process.env.REDIS_TEST_PORT || '6380'),
        db: 1 // Use separate DB for tests
      });
    }

    // Clear test database
    await this.redisClient.flushdb();
    
    return this.redisClient;
  }

  private static async runMigrations(): Promise<void> {
    try {
      await execAsync('npx prisma migrate deploy');
      console.log('✅ Database migrations completed');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  private static async seedBasicData(): Promise<void> {
    try {
      // Create default permissions - using any to handle dynamic Prisma types
      const prismaModels = this.prisma as any;
      
      if (prismaModels.permission) {
        await prismaModels.permission.createMany({
          data: [
            { name: 'read_cases', description: 'Read cases' },
            { name: 'write_cases', description: 'Write cases' },
            { name: 'delete_cases', description: 'Delete cases' },
            { name: 'admin_access', description: 'Admin access' }
          ],
          skipDuplicates: true
        });
      }

      // Create default roles
      let adminRole, auditorRole;
      
      if (prismaModels.role) {
        adminRole = await prismaModels.role.upsert({
          where: { name: 'admin' },
          update: {},
          create: {
            name: 'admin',
            description: 'Administrator role'
          }
        });

        auditorRole = await prismaModels.role.upsert({
          where: { name: 'auditor' },
          update: {},
          create: {
            name: 'auditor',
            description: 'Auditor role'
          }
        });
      }

      // Assign permissions to roles
      if (prismaModels.permission && prismaModels.rolePermission && adminRole && auditorRole) {
        const permissions = await prismaModels.permission.findMany();
        
        await prismaModels.rolePermission.createMany({
          data: permissions.map((permission: any) => ({
            roleId: adminRole.id,
            permissionId: permission.id
          })),
          skipDuplicates: true
        });

        const auditorPermissions = permissions.filter((p: any) => 
          ['read_cases', 'write_cases'].includes(p.name)
        );
        
        await prismaModels.rolePermission.createMany({
          data: auditorPermissions.map((permission: any) => ({
            roleId: auditorRole.id,
            permissionId: permission.id
          })),
          skipDuplicates: true
        });
      }

      console.log('✅ Basic test data seeded');
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      throw error;
    }
  }

  private static async createMongoCollections(db: Db): Promise<void> {
    const collections = [
      'audit_logs',
      'system_events',
      'error_logs',
      'case_notes',
      'performance_metrics'
    ];

    for (const collectionName of collections) {
      try {
        await db.createCollection(collectionName);
      } catch (error) {
        // Collection may already exist, ignore error
      }
    }

    // Create indexes
    await db.collection('audit_logs').createIndexes([
      { key: { resourceId: 1, resourceType: 1 } },
      { key: { userId: 1 } },
      { key: { timestamp: -1 } },
      { key: { action: 1 } }
    ]);

    await db.collection('system_events').createIndexes([
      { key: { userId: 1 } },
      { key: { eventType: 1 } },
      { key: { timestamp: -1 } }
    ]);

    await db.collection('error_logs').createIndexes([
      { key: { timestamp: -1 } },
      { key: { errorType: 1 } },
      { key: { userId: 1 } }
    ]);

    await db.collection('case_notes').createIndexes([
      { key: { caseId: 1 } },
      { key: { content: 'text' } },
      { key: { keywords: 1 } }
    ]);

    console.log('✅ MongoDB collections and indexes created');
  }

  static async cleanupTestDatabase(prisma: PrismaClient): Promise<void> {
    try {
      // Clean up in correct order due to foreign key constraints
      // Using any to handle dynamic Prisma model types
      const models = [
        'caseNote',
        'caseAttachment', 
        'caseAudit',
        'case',
        'userRole',
        'rolePermission',
        'user',
        'department'
      ];
      
      for (const model of models) {
        if ((prisma as any)[model]) {
          await (prisma as any)[model].deleteMany();
        }
      }
      
      await prisma.$disconnect();
      console.log('✅ Test database cleaned up');
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      throw error;
    }
  }

  static async cleanupTestMongoDB(): Promise<void> {
    if (this.mongoClient) {
      const db = this.mongoClient.db('austa_test_logs');
      
      interface CollectionInfo {
        name: string;
        type?: string;
      }
      
      const collections = await db.listCollections().toArray() as CollectionInfo[];
      for (const collection of collections) {
        await db.collection(collection.name).deleteMany({});
      }
      
      await this.mongoClient.close();
      console.log('✅ Test MongoDB cleaned up');
    }
  }

  static async cleanupTestRedis(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.flushdb();
      await this.redisClient.quit();
      console.log('✅ Test Redis cleaned up');
    }
  }

  static async cleanupAll(): Promise<void> {
    await Promise.all([
      this.cleanupTestDatabase(this.prisma),
      this.cleanupTestMongoDB(),
      this.cleanupTestRedis()
    ]);
  }
}

// Convenience exports
export const setupTestDatabase = DatabaseTestSetup.setupTestDatabase.bind(DatabaseTestSetup);
export const setupTestMongoDB = DatabaseTestSetup.setupTestMongoDB.bind(DatabaseTestSetup);
export const setupTestRedis = DatabaseTestSetup.setupTestRedis.bind(DatabaseTestSetup);
export const cleanupTestDatabase = DatabaseTestSetup.cleanupTestDatabase.bind(DatabaseTestSetup);
export const cleanupAll = DatabaseTestSetup.cleanupAll.bind(DatabaseTestSetup);