/**
 * Test Data Manager - Comprehensive test data lifecycle management
 * Handles test database seeding, cleanup, and isolation
 */

import { Pool } from 'pg';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import { DatabaseFixtures, TestDataFactory } from '../fixtures/database-fixtures';
import { faker } from '@faker-js/faker';
import { v4 as uuidv4 } from 'uuid';

export interface TestDataManagerConfig {
  postgres?: {
    connectionString: string;
    schema?: string;
  };
  mongodb?: {
    connectionString: string;
    database: string;
  };
  redis?: {
    host: string;
    port: number;
    db: number;
  };
}

export interface TestDataOptions {
  isolationLevel: 'transaction' | 'database' | 'schema';
  seedData: boolean;
  cleanupAfter: boolean;
  preserveAuditLogs: boolean;
}

export class TestDataManager {
  private config: TestDataManagerConfig;
  private pgPool?: Pool;
  private mongoClient?: MongoClient;
  private redisClient?: Redis;
  private currentTestScope: string;

  constructor(config: TestDataManagerConfig) {
    this.config = config;
    this.currentTestScope = `test_${Date.now()}_${uuidv4().slice(0, 8)}`;
  }

  /**
   * Initialize test database connections
   */
  async initialize(): Promise<void> {
    if (this.config.postgres) {
      this.pgPool = new Pool({ 
        connectionString: this.config.postgres.connectionString,
        max: 10
      });
      await this.pgPool.connect();
    }

    if (this.config.mongodb) {
      this.mongoClient = new MongoClient(this.config.mongodb.connectionString);
      await this.mongoClient.connect();
    }

    if (this.config.redis) {
      this.redisClient = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        db: this.config.redis.db
      });
    }
  }

  /**
   * Setup test environment with data isolation
   */
  async setupTestEnvironment(options: TestDataOptions = {
    isolationLevel: 'transaction',
    seedData: true,
    cleanupAfter: true,
    preserveAuditLogs: false
  }): Promise<TestDataScope> {
    const scope: TestDataScope = {
      scopeId: this.currentTestScope,
      startTime: new Date(),
      options,
      createdEntities: new Map()
    };

    switch (options.isolationLevel) {
      case 'transaction':
        await this.setupTransactionIsolation();
        break;
      case 'database':
        await this.setupDatabaseIsolation();
        break;
      case 'schema':
        await this.setupSchemaIsolation();
        break;
    }

    if (options.seedData) {
      await this.seedTestData(scope);
    }

    return scope;
  }

  /**
   * Seed comprehensive test data
   */
  async seedTestData(scope: TestDataScope): Promise<void> {
    if (!this.pgPool) throw new Error('PostgreSQL not initialized');

    const client = await this.pgPool.connect();
    
    try {
      // Start transaction for atomic seeding
      await client.query('BEGIN');

      // Seed auth schema
      const organizationIds = await this.seedOrganizations(client, scope);
      const userIds = await this.seedUsers(client, scope, organizationIds);
      await this.seedPermissions(client, scope);

      // Seed medical schema
      const patientIds = await this.seedPatients(client, scope);
      const procedureIds = await this.seedProcedures(client, scope);
      const authRequestIds = await this.seedAuthorizationRequests(
        client, scope, patientIds, organizationIds, userIds, procedureIds
      );
      await this.seedAuthorizationDecisions(client, scope, authRequestIds, userIds);
      await this.seedClaims(client, scope, authRequestIds, patientIds, organizationIds, procedureIds);

      // Seed AI schema
      const modelIds = await this.seedAIModels(client, scope);
      await this.seedFraudIndicators(client, scope);
      await this.seedAnalysisResults(client, scope, modelIds);
      await this.seedFraudDetections(client, scope);

      // Seed audit schema
      await this.seedAuditLogs(client, scope, userIds, organizationIds);
      await this.seedComplianceViolations(client, scope);

      // Seed analytics schema
      await this.seedPerformanceMetrics(client, scope);
      await this.seedProviderMetrics(client, scope, organizationIds);

      await client.query('COMMIT');
      console.log(`✅ Test data seeded successfully for scope: ${scope.scopeId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Error seeding test data:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  private async seedOrganizations(client: any, scope: TestDataScope): Promise<string[]> {
    const organizations = DatabaseFixtures.auth.organizations;
    const ids: string[] = [];

    for (const org of organizations) {
      const result = await client.query(`
        INSERT INTO auth.organizations (id, name, type, tax_id, status, metadata, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id
      `, [org.id, org.name, org.type, org.tax_id, org.status, JSON.stringify(org.metadata)]);
      
      ids.push(result.rows[0].id);
      scope.createdEntities.set('organizations', [...(scope.createdEntities.get('organizations') || []), org.id]);
    }

    return ids;
  }

  private async seedUsers(client: any, scope: TestDataScope, organizationIds: string[]): Promise<string[]> {
    const users = DatabaseFixtures.auth.users;
    const ids: string[] = [];

    for (let i = 0; i < users.length; i++) {
      const user = { ...users[i] };
      (user as any).organization_id = organizationIds[i % organizationIds.length];

      const result = await client.query(`
        INSERT INTO auth.users (
          id, organization_id, email, password_hash, full_name, role, 
          license_number, specialization, status, last_login, 
          failed_login_attempts, locked_until, metadata, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        RETURNING id
      `, [
        user.id, (user as any).organization_id, user.email, user.password_hash,
        user.full_name, user.role, user.license_number, user.specialization,
        user.status, user.last_login, user.failed_login_attempts,
        user.locked_until, JSON.stringify(user.metadata)
      ]);

      ids.push(result.rows[0].id);
      scope.createdEntities.set('users', [...(scope.createdEntities.get('users') || []), user.id]);
    }

    return ids;
  }

  private async seedPatients(client: any, scope: TestDataScope): Promise<string[]> {
    const patients = [
      ...DatabaseFixtures.medical.patients,
      ...TestDataFactory.generatePatients(50) // Generate additional test patients
    ];
    const ids: string[] = [];

    for (const patient of patients) {
      const result = await client.query(`
        INSERT INTO medical.patients (
          id, patient_code, birth_year, gender, insurance_type, 
          risk_category, chronic_conditions, metadata, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING id
      `, [
        patient.id, patient.patient_code, patient.birth_year,
        patient.gender, patient.insurance_type, patient.risk_category,
        JSON.stringify(patient.chronic_conditions), JSON.stringify(patient.metadata)
      ]);

      ids.push(result.rows[0].id);
      scope.createdEntities.set('patients', [...(scope.createdEntities.get('patients') || []), patient.id]);
    }

    return ids;
  }

  private async seedProcedures(client: any, scope: TestDataScope): Promise<string[]> {
    const procedures = DatabaseFixtures.medical.procedures;
    const ids: string[] = [];

    for (const procedure of procedures) {
      const result = await client.query(`
        INSERT INTO medical.procedures (
          id, code, name, category, subcategory, typical_duration_minutes,
          requires_preauth, risk_level, guidelines, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING id
      `, [
        procedure.id, procedure.code, procedure.name, procedure.category,
        procedure.subcategory, procedure.typical_duration_minutes,
        procedure.requires_preauth, procedure.risk_level,
        JSON.stringify(procedure.guidelines)
      ]);

      ids.push(result.rows[0].id);
      scope.createdEntities.set('procedures', [...(scope.createdEntities.get('procedures') || []), procedure.id]);
    }

    return ids;
  }

  private async seedAuthorizationRequests(
    client: any, scope: TestDataScope, patientIds: string[], 
    organizationIds: string[], userIds: string[], procedureIds: string[]
  ): Promise<string[]> {
    const authRequests = [
      ...DatabaseFixtures.medical.authorization_requests,
      ...TestDataFactory.generateAuthorizationRequests(100)
    ];
    const ids: string[] = [];

    for (const request of authRequests) {
      (request as any).patient_id = faker.helpers.arrayElement(patientIds);
      (request as any).requesting_provider_id = faker.helpers.arrayElement(organizationIds);
      (request as any).requesting_doctor_id = faker.helpers.arrayElement(userIds);
      (request as any).procedure_id = faker.helpers.arrayElement(procedureIds);

      const result = await client.query(`
        INSERT INTO medical.authorization_requests (
          id, request_number, patient_id, requesting_provider_id,
          requesting_doctor_id, procedure_id, urgency_level,
          clinical_justification, diagnosis_codes, supporting_documents,
          status, submitted_at, due_date, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        RETURNING id
      `, [
        (request as any).id, (request as any).request_number, (request as any).patient_id,
        (request as any).requesting_provider_id, (request as any).requesting_doctor_id,
        (request as any).procedure_id, (request as any).urgency_level, (request as any).clinical_justification,
        JSON.stringify((request as any).diagnosis_codes), JSON.stringify((request as any).supporting_documents),
        (request as any).status, (request as any).submitted_at, (request as any).due_date
      ]);

      ids.push(result.rows[0].id);
      scope.createdEntities.set('authorization_requests', [...(scope.createdEntities.get('authorization_requests') || []), request.id]);
    }

    return ids;
  }

  private async seedAIModels(client: any, scope: TestDataScope): Promise<string[]> {
    const models = DatabaseFixtures.ai.models;
    const ids: string[] = [];

    for (const model of models) {
      const result = await client.query(`
        INSERT INTO ai.models (
          id, name, version, type, status, accuracy_score,
          configuration, deployed_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING id
      `, [
        model.id, model.name, model.version, model.type,
        model.status, model.accuracy_score,
        JSON.stringify(model.configuration), model.deployed_at
      ]);

      ids.push(result.rows[0].id);
      scope.createdEntities.set('ai_models', [...(scope.createdEntities.get('ai_models') || []), model.id]);
    }

    return ids;
  }

  // Additional seeding methods for other entities...
  private async seedPermissions(_client: any, _scope: TestDataScope): Promise<void> {
    // Implementation for permissions seeding
  }

  private async seedAuthorizationDecisions(_client: any, _scope: TestDataScope, _authRequestIds: string[], _userIds: string[]): Promise<void> {
    // Implementation for authorization decisions
  }

  private async seedClaims(_client: any, _scope: TestDataScope, _authRequestIds: string[], _patientIds: string[], _organizationIds: string[], _procedureIds: string[]): Promise<void> {
    // Implementation for claims seeding
  }

  private async seedFraudIndicators(_client: any, _scope: TestDataScope): Promise<void> {
    // Implementation for fraud indicators
  }

  private async seedAnalysisResults(_client: any, _scope: TestDataScope, _modelIds: string[]): Promise<void> {
    // Implementation for analysis results
  }

  private async seedFraudDetections(_client: any, _scope: TestDataScope): Promise<void> {
    // Implementation for fraud detections
  }

  private async seedAuditLogs(_client: any, _scope: TestDataScope, _userIds: string[], _organizationIds: string[]): Promise<void> {
    // Implementation for audit logs
  }

  private async seedComplianceViolations(_client: any, _scope: TestDataScope): Promise<void> {
    // Implementation for compliance violations
  }

  private async seedPerformanceMetrics(_client: any, _scope: TestDataScope): Promise<void> {
    // Implementation for performance metrics
  }

  private async seedProviderMetrics(_client: any, _scope: TestDataScope, _organizationIds: string[]): Promise<void> {
    // Implementation for provider metrics
  }

  /**
   * Setup transaction-level isolation
   */
  private async setupTransactionIsolation(): Promise<void> {
    if (!this.pgPool) return;
    // Implementation for transaction isolation
  }

  /**
   * Setup database-level isolation
   */
  private async setupDatabaseIsolation(): Promise<void> {
    if (!this.pgPool) return;
    // Implementation for database isolation
  }

  /**
   * Setup schema-level isolation
   */
  private async setupSchemaIsolation(): Promise<void> {
    if (!this.pgPool) return;
    // Implementation for schema isolation
  }

  /**
   * Cleanup test data
   */
  async cleanup(scope: TestDataScope): Promise<void> {
    if (!scope.options.cleanupAfter) {
      console.log(`🔄 Preserving test data for scope: ${scope.scopeId}`);
      return;
    }

    if (!this.pgPool) throw new Error('PostgreSQL not initialized');
    
    const client = await this.pgPool.connect();
    
    try {
      await client.query('BEGIN');

      // Clean up in reverse order of creation to respect foreign key constraints
      const cleanupOrder = [
        'analytics.user_activity_summary',
        'analytics.provider_metrics', 
        'analytics.performance_metrics',
        'audit.compliance_violations',
        'audit.decision_trails',
        'audit.activity_logs',
        'ai.fraud_detections',
        'ai.analysis_results',
        'ai.fraud_indicators',
        'ai.models',
        'medical.claims',
        'medical.authorization_decisions',
        'medical.authorization_requests',
        'medical.procedures',
        'medical.patients',
        'auth.role_permissions',
        'auth.permissions',
        'auth.sessions',
        'auth.users',
        'auth.organizations'
      ];

      for (const table of cleanupOrder) {
        const entityIds = scope.createdEntities.get(table.split('.')[1]);
        if (entityIds && entityIds.length > 0) {
          const placeholders = entityIds.map((_, i) => `$${i + 1}`).join(',');
          await client.query(`DELETE FROM ${table} WHERE id IN (${placeholders})`, entityIds);
        }
      }

      await client.query('COMMIT');
      console.log(`✅ Test data cleaned up for scope: ${scope.scopeId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Error cleaning up test data:`, error);
      throw error;
    } finally {
      client.release();
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

  /**
   * Generate test data snapshots for debugging
   */
  async createSnapshot(scope: TestDataScope, name: string): Promise<TestDataSnapshot> {
    return {
      name,
      scopeId: scope.scopeId,
      timestamp: new Date(),
      entityCounts: new Map(
        Array.from(scope.createdEntities.entries()).map(
          ([key, value]) => [key, value.length]
        )
      ),
      sampleData: await this.extractSampleData(scope)
    };
  }

  private async extractSampleData(_scope: TestDataScope): Promise<Record<string, any[]>> {
    // Implementation to extract sample data for debugging
    return {};
  }
}

export interface TestDataScope {
  scopeId: string;
  startTime: Date;
  options: TestDataOptions;
  createdEntities: Map<string, string[]>;
}

export interface TestDataSnapshot {
  name: string;
  scopeId: string;
  timestamp: Date;
  entityCounts: Map<string, number>;
  sampleData: Record<string, any[]>;
}

// Convenience factory functions
export const createTestDataManager = (config: TestDataManagerConfig) => 
  new TestDataManager(config);

export const createPostgresTestManager = (connectionString: string) =>
  new TestDataManager({ postgres: { connectionString } });

export const createFullStackTestManager = (
  postgresUrl: string,
  mongoUrl: string,
  redisConfig: { host: string; port: number; db: number }
) => new TestDataManager({
  postgres: { connectionString: postgresUrl },
  mongodb: { connectionString: mongoUrl, database: 'test_db' },
  redis: redisConfig
});