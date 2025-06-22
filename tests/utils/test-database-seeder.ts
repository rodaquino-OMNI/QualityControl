/**
 * Test Database Seeder - SQL-based seeding for PostgreSQL test database
 * Provides efficient batch seeding with proper foreign key handling
 */

import { Pool, PoolClient } from 'pg';
import { faker } from '@faker-js/faker';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

export interface SeedingOptions {
  batchSize: number;
  enableConstraints: boolean;
  preserveExisting: boolean;
  logProgress: boolean;
}

export interface SeedingStats {
  startTime: Date;
  endTime?: Date;
  tablesSeeded: number;
  totalRecords: number;
  recordsByTable: Map<string, number>;
  errors: string[];
}

export class TestDatabaseSeeder {
  private pool: Pool;
  private stats: SeedingStats;

  constructor(connectionString: string) {
    this.pool = new Pool({ 
      connectionString,
      max: 5 
    });
    this.stats = {
      startTime: new Date(),
      tablesSeeded: 0,
      totalRecords: 0,
      recordsByTable: new Map(),
      errors: []
    };
  }

  /**
   * Main seeding orchestration method
   */
  async seedDatabase(options: SeedingOptions = {
    batchSize: 100,
    enableConstraints: true,
    preserveExisting: false,
    logProgress: true
  }): Promise<SeedingStats> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (!options.preserveExisting) {
        await this.clearTestData(client);
      }

      if (!options.enableConstraints) {
        await this.disableConstraints(client);
      }

      // Seed in proper dependency order
      await this.seedAuthSchema(client, options);
      await this.seedMedicalSchema(client, options);
      await this.seedAISchema(client, options);
      await this.seedAuditSchema(client, options);
      await this.seedAnalyticsSchema(client, options);

      if (!options.enableConstraints) {
        await this.enableConstraints(client);
      }

      await client.query('COMMIT');
      
      this.stats.endTime = new Date();
      
      if (options.logProgress) {
        this.logSeedingStats();
      }

      return this.stats;
    } catch (error) {
      await client.query('ROLLBACK');
      this.stats.errors.push(`Seeding failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Seed AUTH schema with organizations, users, permissions
   */
  private async seedAuthSchema(client: PoolClient, options: SeedingOptions): Promise<void> {
    // Seed Organizations
    const organizations = this.generateOrganizations(50);
    await this.batchInsert(client, 'auth.organizations', organizations, [
      'id', 'name', 'type', 'tax_id', 'status', 'metadata'
    ], options);

    // Seed Permissions
    const permissions = this.generatePermissions();
    await this.batchInsert(client, 'auth.permissions', permissions, [
      'id', 'resource', 'action', 'description'
    ], options);

    // Seed Users
    const users = await this.generateUsers(200, organizations);
    await this.batchInsert(client, 'auth.users', users, [
      'id', 'organization_id', 'email', 'password_hash', 'full_name', 'role',
      'license_number', 'specialization', 'status', 'last_login',
      'failed_login_attempts', 'locked_until', 'metadata'
    ], options);

    // Seed Role Permissions
    const rolePermissions = this.generateRolePermissions(permissions);
    await this.batchInsert(client, 'auth.role_permissions', rolePermissions, [
      'role', 'permission_id'
    ], options);
  }

  /**
   * Seed MEDICAL schema with patients, procedures, authorizations
   */
  private async seedMedicalSchema(client: PoolClient, options: SeedingOptions): Promise<void> {
    // Seed Patients
    const patients = this.generatePatients(500);
    await this.batchInsert(client, 'medical.patients', patients, [
      'id', 'patient_code', 'birth_year', 'gender', 'insurance_type',
      'risk_category', 'chronic_conditions', 'metadata'
    ], options);

    // Seed Procedures
    const procedures = this.generateProcedures(100);
    await this.batchInsert(client, 'medical.procedures', procedures, [
      'id', 'code', 'name', 'category', 'subcategory', 'typical_duration_minutes',
      'requires_preauth', 'risk_level', 'guidelines'
    ], options);

    // Get organization and user IDs for foreign keys
    const organizationIds = await this.getEntityIds(client, 'auth.organizations');
    const userIds = await this.getEntityIds(client, 'auth.users');
    const patientIds = await this.getEntityIds(client, 'medical.patients');
    const procedureIds = await this.getEntityIds(client, 'medical.procedures');

    // Seed Authorization Requests
    const authRequests = this.generateAuthorizationRequests(1000, patientIds, organizationIds, userIds, procedureIds);
    await this.batchInsert(client, 'medical.authorization_requests', authRequests, [
      'id', 'request_number', 'patient_id', 'requesting_provider_id',
      'requesting_doctor_id', 'procedure_id', 'urgency_level',
      'clinical_justification', 'diagnosis_codes', 'supporting_documents',
      'status', 'submitted_at', 'due_date'
    ], options);

    // Seed Authorization Decisions
    const authRequestIds = await this.getEntityIds(client, 'medical.authorization_requests');
    const authDecisions = this.generateAuthorizationDecisions(800, authRequestIds, userIds);
    await this.batchInsert(client, 'medical.authorization_decisions', authDecisions, [
      'id', 'authorization_request_id', 'decision_type', 'decision',
      'reviewer_id', 'decision_rationale', 'conditions_applied',
      'valid_from', 'valid_until', 'appeal_deadline', 'decided_at'
    ], options);

    // Seed Claims
    const claims = this.generateClaims(600, authRequestIds, patientIds, organizationIds, procedureIds);
    await this.batchInsert(client, 'medical.claims', claims, [
      'id', 'claim_number', 'authorization_id', 'patient_id', 'provider_id',
      'procedure_id', 'service_date', 'billed_amount', 'allowed_amount',
      'paid_amount', 'status', 'denial_reason', 'processed_at'
    ], options);
  }

  /**
   * Seed AI schema with models, analysis results, fraud detection
   */
  private async seedAISchema(client: PoolClient, options: SeedingOptions): Promise<void> {
    // Seed AI Models
    const models = this.generateAIModels();
    await this.batchInsert(client, 'ai.models', models, [
      'id', 'name', 'version', 'type', 'status', 'accuracy_score',
      'configuration', 'deployed_at'
    ], options);

    // Seed Fraud Indicators
    const fraudIndicators = this.generateFraudIndicators();
    await this.batchInsert(client, 'ai.fraud_indicators', fraudIndicators, [
      'id', 'name', 'category', 'severity', 'detection_logic', 'active'
    ], options);

    // Get model and indicator IDs
    const modelIds = await this.getEntityIds(client, 'ai.models');
    const indicatorIds = await this.getEntityIds(client, 'ai.fraud_indicators');

    // Generate entity IDs for analysis
    const authRequestIds = await this.getEntityIds(client, 'medical.authorization_requests');
    const claimIds = await this.getEntityIds(client, 'medical.claims');
    const patientIds = await this.getEntityIds(client, 'medical.patients');
    const organizationIds = await this.getEntityIds(client, 'auth.organizations');

    // Seed Analysis Results
    const analysisResults = this.generateAnalysisResults(2000, modelIds, [
      ...authRequestIds.slice(0, 500),
      ...claimIds.slice(0, 300),
      ...patientIds.slice(0, 200),
      ...organizationIds.slice(0, 100)
    ]);
    await this.batchInsert(client, 'ai.analysis_results', analysisResults, [
      'id', 'model_id', 'entity_type', 'entity_id', 'analysis_type',
      'confidence_score', 'risk_score', 'recommendations', 'findings',
      'processing_time_ms', 'analyzed_at'
    ], options);

    // Seed Fraud Detections
    const fraudDetections = this.generateFraudDetections(300, indicatorIds, [
      ...authRequestIds.slice(0, 150),
      ...claimIds.slice(0, 100),
      ...organizationIds.slice(0, 50)
    ]);
    await this.batchInsert(client, 'ai.fraud_detections', fraudDetections, [
      'id', 'entity_type', 'entity_id', 'indicator_id', 'confidence_score',
      'evidence', 'status', 'investigator_id', 'resolution_notes',
      'detected_at', 'resolved_at'
    ], options);
  }

  /**
   * Seed AUDIT schema with activity logs and compliance violations
   */
  private async seedAuditSchema(client: PoolClient, options: SeedingOptions): Promise<void> {
    const userIds = await this.getEntityIds(client, 'auth.users');
    const organizationIds = await this.getEntityIds(client, 'auth.organizations');
    const authRequestIds = await this.getEntityIds(client, 'medical.authorization_requests');

    // Seed Activity Logs
    const activityLogs = this.generateActivityLogs(5000, userIds, organizationIds, authRequestIds);
    await this.batchInsert(client, 'audit.activity_logs', activityLogs, [
      'id', 'user_id', 'organization_id', 'action', 'entity_type',
      'entity_id', 'ip_address', 'user_agent', 'request_id',
      'changes', 'metadata'
    ], options);

    // Seed Compliance Violations
    const violations = this.generateComplianceViolations(150, authRequestIds);
    await this.batchInsert(client, 'audit.compliance_violations', violations, [
      'id', 'violation_type', 'severity', 'entity_type', 'entity_id',
      'description', 'regulatory_reference', 'detected_by', 'status',
      'resolution_required_by', 'resolution_notes', 'detected_at', 'resolved_at'
    ], options);
  }

  /**
   * Seed ANALYTICS schema with performance and provider metrics
   */
  private async seedAnalyticsSchema(client: PoolClient, options: SeedingOptions): Promise<void> {
    const organizationIds = await this.getEntityIds(client, 'auth.organizations');
    const userIds = await this.getEntityIds(client, 'auth.users');

    // Seed Performance Metrics (time series data)
    const performanceMetrics = this.generatePerformanceMetrics(1000);
    await this.batchInsert(client, 'analytics.performance_metrics', performanceMetrics, [
      'id', 'metric_type', 'metric_name', 'metric_value', 'dimensions',
      'period_start', 'period_end', 'calculated_at'
    ], options);

    // Seed Provider Metrics (daily aggregates)
    const providerMetrics = this.generateProviderMetrics(organizationIds, 90); // 90 days of data
    await this.batchInsert(client, 'analytics.provider_metrics', providerMetrics, [
      'id', 'provider_id', 'metric_date', 'total_authorizations',
      'approved_authorizations', 'denied_authorizations', 'approval_rate',
      'average_processing_time_hours', 'fraud_incidents',
      'compliance_score', 'quality_score'
    ], options);

    // Seed User Activity Summary
    const userActivity = this.generateUserActivitySummary(userIds, 30); // 30 days of data
    await this.batchInsert(client, 'analytics.user_activity_summary', userActivity, [
      'id', 'user_id', 'activity_date', 'total_decisions', 'approvals',
      'denials', 'average_decision_time_minutes', 'overrides', 'ai_agreement_rate'
    ], options);
  }

  // Data generation methods
  private generateOrganizations(count: number): any[] {
    const types = ['provider', 'insurer', 'administrator', 'auditor'];
    return Array.from({ length: count }, () => ({
      id: uuidv4(),
      name: faker.company.name(),
      type: faker.helpers.arrayElement(types),
      tax_id: faker.string.numeric({ length: 9, allowLeadingZeros: false }),
      status: faker.helpers.weightedArrayElement([
        { weight: 0.85, value: 'active' },
        { weight: 0.10, value: 'suspended' },
        { weight: 0.05, value: 'inactive' }
      ]),
      metadata: JSON.stringify({
        location: `${faker.location.city()}, ${faker.location.state()}`,
        establishedYear: faker.date.past({ years: 20 }).getFullYear(),
        size: faker.helpers.arrayElement(['small', 'medium', 'large'])
      })
    }));
  }

  private async generateUsers(count: number, organizations: any[]): Promise<any[]> {
    const roles = ['admin', 'doctor', 'nurse', 'auditor', 'analyst', 'reviewer'];
    const users = [];

    for (let i = 0; i < count; i++) {
      const role = faker.helpers.arrayElement(roles);
      users.push({
        id: uuidv4(),
        organization_id: faker.helpers.arrayElement(organizations).id,
        email: faker.internet.email(),
        password_hash: await bcrypt.hash('TestPassword123!', 10),
        full_name: faker.person.fullName(),
        role,
        license_number: role === 'doctor' ? `MD${faker.string.numeric(6)}` : 
                       role === 'nurse' ? `RN${faker.string.numeric(6)}` : null,
        specialization: role === 'doctor' ? faker.helpers.arrayElement([
          'Cardiology', 'Oncology', 'Neurology', 'Orthopedics', 'Gastroenterology'
        ]) : null,
        status: faker.helpers.weightedArrayElement([
          { weight: 0.90, value: 'active' },
          { weight: 0.05, value: 'suspended' },
          { weight: 0.03, value: 'inactive' },
          { weight: 0.02, value: 'pending' }
        ]),
        last_login: faker.date.recent({ days: 30 }),
        failed_login_attempts: faker.number.int({ min: 0, max: 2 }),
        locked_until: null,
        metadata: JSON.stringify({
          department: faker.helpers.arrayElement(['Emergency', 'ICU', 'Surgery', 'Outpatient']),
          yearsExperience: faker.number.int({ min: 1, max: 30 })
        })
      });
    }

    return users;
  }

  private generatePermissions(): any[] {
    const resources = ['cases', 'authorizations', 'claims', 'patients', 'providers', 'reports', 'audit', 'ai'];
    const actions = ['read', 'write', 'delete', 'approve', 'deny', 'configure'];
    const permissions = [];

    for (const resource of resources) {
      for (const action of actions) {
        permissions.push({
          id: uuidv4(),
          resource,
          action,
          description: `${action} ${resource}`
        });
      }
    }

    return permissions;
  }

  private generateRolePermissions(permissions: any[]): any[] {
    const roles = ['admin', 'doctor', 'nurse', 'auditor', 'analyst', 'reviewer'];
    const rolePermissions = [];

    for (const role of roles) {
      // Admin gets all permissions
      if (role === 'admin') {
        for (const permission of permissions) {
          rolePermissions.push({
            role,
            permission_id: permission.id
          });
        }
      } else {
        // Other roles get subset of permissions
        const subset = faker.helpers.arrayElements(permissions, { min: 5, max: 15 });
        for (const permission of subset) {
          rolePermissions.push({
            role,
            permission_id: permission.id
          });
        }
      }
    }

    return rolePermissions;
  }

  private generatePatients(count: number): any[] {
    return Array.from({ length: count }, () => ({
      id: uuidv4(),
      patient_code: `PAT-${faker.string.numeric(6)}`,
      birth_year: faker.date.birthdate({ min: 18, max: 90, mode: 'age' }).getFullYear(),
      gender: faker.person.sex(),
      insurance_type: faker.helpers.arrayElement(['PPO', 'HMO', 'EPO', 'POS']),
      risk_category: faker.helpers.weightedArrayElement([
        { weight: 0.40, value: 'low' },
        { weight: 0.35, value: 'medium' },
        { weight: 0.20, value: 'high' },
        { weight: 0.05, value: 'critical' }
      ]),
      chronic_conditions: JSON.stringify(faker.helpers.arrayElements([
        'diabetes', 'hypertension', 'heart_disease', 'copd', 'arthritis', 'cancer'
      ], { min: 0, max: 3 })),
      metadata: JSON.stringify({
        anonymized_zip: faker.location.zipCode().slice(0, 3) + 'XX',
        insurance_tier: faker.helpers.arrayElement(['basic', 'standard', 'premium'])
      })
    }));
  }

  // Additional generation methods would continue here...
  private generateProcedures(count: number): any[] {
    const categories = ['Surgical', 'Diagnostic', 'Therapeutic', 'Emergency', 'Preventive'];
    const riskLevels = ['low', 'medium', 'high', 'critical'];
    const procedures = [];
    
    for (let i = 0; i < count; i++) {
      procedures.push({
        id: uuidv4(),
        code: `CPT-${faker.string.numeric(5)}`,
        name: faker.helpers.arrayElement([
          'MRI Scan', 'CT Scan', 'X-Ray', 'Blood Test', 'Surgery',
          'Colonoscopy', 'Endoscopy', 'Ultrasound', 'Biopsy', 'Chemotherapy'
        ]) + ' - ' + faker.lorem.words(2),
        category: faker.helpers.arrayElement(categories),
        subcategory: faker.lorem.word(),
        typical_duration_minutes: faker.number.int({ min: 15, max: 480 }),
        requires_preauth: faker.datatype.boolean({ probability: 0.7 }),
        risk_level: faker.helpers.arrayElement(riskLevels),
        guidelines: JSON.stringify({
          requirements: faker.lorem.sentences(2),
          contraindications: faker.lorem.sentences(1)
        })
      });
    }
    
    return procedures;
  }

  private generateAuthorizationRequests(count: number, patientIds: string[], organizationIds: string[], userIds: string[], procedureIds: string[]): any[] {
    const statuses = ['pending', 'approved', 'denied', 'pending_info', 'expired'];
    const urgencyLevels = ['routine', 'urgent', 'emergency', 'elective'];
    const requests = [];
    
    for (let i = 0; i < count; i++) {
      const submitted = faker.date.recent({ days: 30 });
      const dueDate = new Date(submitted);
      dueDate.setDate(dueDate.getDate() + faker.number.int({ min: 1, max: 14 }));
      
      requests.push({
        id: uuidv4(),
        request_number: `AUTH-${faker.string.numeric(8)}`,
        patient_id: faker.helpers.arrayElement(patientIds),
        requesting_provider_id: faker.helpers.arrayElement(organizationIds),
        requesting_doctor_id: faker.helpers.arrayElement(userIds),
        procedure_id: faker.helpers.arrayElement(procedureIds),
        urgency_level: faker.helpers.arrayElement(urgencyLevels),
        clinical_justification: faker.lorem.paragraph(),
        diagnosis_codes: JSON.stringify([
          `ICD-${faker.string.alphanumeric(3).toUpperCase()}`,
          `ICD-${faker.string.alphanumeric(3).toUpperCase()}`
        ]),
        supporting_documents: JSON.stringify([
          { type: 'lab_report', url: faker.internet.url() },
          { type: 'medical_records', url: faker.internet.url() }
        ]),
        status: faker.helpers.arrayElement(statuses),
        submitted_at: submitted,
        due_date: dueDate
      });
    }
    
    return requests;
  }

  // Continue with other generation methods...
  private generateAuthorizationDecisions(count: number, authRequestIds: string[], userIds: string[]): any[] {
    const decisionTypes = ['human', 'ai_assisted', 'automatic', 'committee'];
    const decisions = ['approved', 'denied', 'partially_approved', 'pending_info'];
    const results = [];
    
    for (let i = 0; i < count; i++) {
      const decidedAt = faker.date.recent({ days: 20 });
      const validFrom = new Date(decidedAt);
      const validUntil = new Date(validFrom);
      validUntil.setMonth(validUntil.getMonth() + faker.number.int({ min: 1, max: 12 }));
      
      results.push({
        id: uuidv4(),
        authorization_request_id: faker.helpers.arrayElement(authRequestIds),
        decision_type: faker.helpers.arrayElement(decisionTypes),
        decision: faker.helpers.arrayElement(decisions),
        reviewer_id: faker.helpers.arrayElement(userIds),
        decision_rationale: faker.lorem.paragraph(),
        conditions_applied: JSON.stringify(
          faker.datatype.boolean() ? [faker.lorem.sentence()] : []
        ),
        valid_from: validFrom,
        valid_until: validUntil,
        appeal_deadline: new Date(decidedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        decided_at: decidedAt
      });
    }
    
    return results;
  }
  
  private generateClaims(count: number, authRequestIds: string[], patientIds: string[], organizationIds: string[], procedureIds: string[]): any[] {
    const statuses = ['pending', 'approved', 'denied', 'partial', 'under_review'];
    const denialReasons = ['coverage_expired', 'not_medically_necessary', 'out_of_network', 'documentation_missing'];
    const claims = [];
    
    for (let i = 0; i < count; i++) {
      const billedAmount = faker.number.float({ min: 100, max: 50000, fractionDigits: 2 });
      const allowedAmount = billedAmount * faker.number.float({ min: 0.5, max: 1, fractionDigits: 2 });
      const paidAmount = allowedAmount * faker.number.float({ min: 0.7, max: 1, fractionDigits: 2 });
      const status = faker.helpers.arrayElement(statuses);
      
      claims.push({
        id: uuidv4(),
        claim_number: `CLM-${faker.string.numeric(10)}`,
        authorization_id: faker.helpers.arrayElement(authRequestIds),
        patient_id: faker.helpers.arrayElement(patientIds),
        provider_id: faker.helpers.arrayElement(organizationIds),
        procedure_id: faker.helpers.arrayElement(procedureIds),
        service_date: faker.date.recent({ days: 60 }),
        billed_amount: billedAmount,
        allowed_amount: allowedAmount,
        paid_amount: status === 'approved' ? paidAmount : 0,
        status,
        denial_reason: status === 'denied' ? faker.helpers.arrayElement(denialReasons) : null,
        processed_at: faker.date.recent({ days: 10 })
      });
    }
    
    return claims;
  }
  
  private generateAIModels(): any[] {
    return [
      {
        id: uuidv4(),
        name: 'Fraud Detection Model',
        version: '2.3.1',
        type: 'classification',
        status: 'active',
        accuracy_score: 0.945,
        configuration: JSON.stringify({
          algorithm: 'XGBoost',
          features: 150,
          threshold: 0.85
        }),
        deployed_at: faker.date.past({ years: 1 })
      },
      {
        id: uuidv4(),
        name: 'Authorization Predictor',
        version: '1.8.0',
        type: 'prediction',
        status: 'active',
        accuracy_score: 0.892,
        configuration: JSON.stringify({
          algorithm: 'RandomForest',
          features: 200,
          threshold: 0.80
        }),
        deployed_at: faker.date.past({ years: 1 })
      },
      {
        id: uuidv4(),
        name: 'Anomaly Detector',
        version: '3.1.0',
        type: 'anomaly_detection',
        status: 'testing',
        accuracy_score: 0.876,
        configuration: JSON.stringify({
          algorithm: 'IsolationForest',
          contamination: 0.1
        }),
        deployed_at: faker.date.recent({ days: 30 })
      }
    ];
  }
  
  private generateFraudIndicators(): any[] {
    
    return [
      {
        id: uuidv4(),
        name: 'Duplicate Billing',
        category: 'billing',
        severity: 'high',
        detection_logic: JSON.stringify({
          rule: 'same_procedure_same_patient_within_24h',
          threshold: 0.95
        }),
        active: true
      },
      {
        id: uuidv4(),
        name: 'Identity Mismatch',
        category: 'identity',
        severity: 'critical',
        detection_logic: JSON.stringify({
          rule: 'patient_demographics_inconsistent',
          threshold: 0.90
        }),
        active: true
      },
      {
        id: uuidv4(),
        name: 'Provider Pattern Anomaly',
        category: 'provider',
        severity: 'medium',
        detection_logic: JSON.stringify({
          rule: 'billing_pattern_deviation',
          threshold: 0.85
        }),
        active: true
      },
      {
        id: uuidv4(),
        name: 'Prescription Abuse',
        category: 'prescription',
        severity: 'high',
        detection_logic: JSON.stringify({
          rule: 'controlled_substance_frequency',
          threshold: 0.80
        }),
        active: true
      },
      {
        id: uuidv4(),
        name: 'Service Upcoding',
        category: 'service',
        severity: 'medium',
        detection_logic: JSON.stringify({
          rule: 'service_code_inflation',
          threshold: 0.75
        }),
        active: true
      }
    ];
  }
  
  private generateAnalysisResults(count: number, modelIds: string[], entityIds: string[]): any[] {
    const entityTypes = ['authorization_request', 'claim', 'patient', 'provider'];
    const analysisTypes = ['fraud_detection', 'risk_assessment', 'pattern_analysis', 'compliance_check'];
    const results = [];
    
    for (let i = 0; i < count; i++) {
      results.push({
        id: uuidv4(),
        model_id: faker.helpers.arrayElement(modelIds),
        entity_type: faker.helpers.arrayElement(entityTypes),
        entity_id: faker.helpers.arrayElement(entityIds),
        analysis_type: faker.helpers.arrayElement(analysisTypes),
        confidence_score: faker.number.float({ min: 0.5, max: 1, fractionDigits: 3 }),
        risk_score: faker.number.float({ min: 0, max: 1, fractionDigits: 3 }),
        recommendations: JSON.stringify([
          faker.lorem.sentence(),
          faker.lorem.sentence()
        ]),
        findings: JSON.stringify({
          anomalies: faker.number.int({ min: 0, max: 5 }),
          patterns: faker.lorem.words(3).split(' ')
        }),
        processing_time_ms: faker.number.int({ min: 10, max: 5000 }),
        analyzed_at: faker.date.recent({ days: 7 })
      });
    }
    
    return results;
  }
  
  private generateFraudDetections(count: number, indicatorIds: string[], entityIds: string[]): any[] {
    const entityTypes = ['authorization_request', 'claim', 'provider'];
    const statuses = ['detected', 'investigating', 'confirmed', 'false_positive', 'resolved'];
    const detections = [];
    
    for (let i = 0; i < count; i++) {
      const detectedAt = faker.date.recent({ days: 30 });
      const status = faker.helpers.arrayElement(statuses);
      
      detections.push({
        id: uuidv4(),
        entity_type: faker.helpers.arrayElement(entityTypes),
        entity_id: faker.helpers.arrayElement(entityIds),
        indicator_id: faker.helpers.arrayElement(indicatorIds),
        confidence_score: faker.number.float({ min: 0.7, max: 1, fractionDigits: 3 }),
        evidence: JSON.stringify({
          data_points: faker.number.int({ min: 3, max: 10 }),
          description: faker.lorem.paragraph()
        }),
        status,
        investigator_id: status !== 'detected' ? faker.helpers.arrayElement(entityIds.slice(0, 10)) : null,
        resolution_notes: ['confirmed', 'false_positive', 'resolved'].includes(status) ? faker.lorem.sentence() : null,
        detected_at: detectedAt,
        resolved_at: ['confirmed', 'false_positive', 'resolved'].includes(status) ? faker.date.recent({ days: 5 }) : null
      });
    }
    
    return detections;
  }
  
  private generateActivityLogs(count: number, userIds: string[], organizationIds: string[], entityIds: string[]): any[] {
    const actions = ['view', 'create', 'update', 'delete', 'approve', 'deny', 'export', 'login', 'logout'];
    const entityTypes = ['case', 'authorization', 'claim', 'user', 'report'];
    const logs = [];
    
    for (let i = 0; i < count; i++) {
      logs.push({
        id: uuidv4(),
        user_id: faker.helpers.arrayElement(userIds),
        organization_id: faker.helpers.arrayElement(organizationIds),
        action: faker.helpers.arrayElement(actions),
        entity_type: faker.helpers.arrayElement(entityTypes),
        entity_id: faker.helpers.arrayElement(entityIds),
        ip_address: faker.internet.ip(),
        user_agent: faker.internet.userAgent(),
        request_id: uuidv4(),
        changes: JSON.stringify({
          before: faker.datatype.boolean() ? { status: 'pending' } : null,
          after: faker.datatype.boolean() ? { status: 'approved' } : null
        }),
        metadata: JSON.stringify({
          duration_ms: faker.number.int({ min: 100, max: 5000 }),
          browser: faker.helpers.arrayElement(['Chrome', 'Firefox', 'Safari', 'Edge'])
        })
      });
    }
    
    return logs;
  }
  
  private generateComplianceViolations(count: number, entityIds: string[]): any[] {
    const violationTypes = ['hipaa', 'processing_time', 'documentation', 'authorization_criteria', 'appeal_timeline'];
    const severities = ['low', 'medium', 'high', 'critical'];
    const statuses = ['open', 'under_review', 'remediated', 'escalated'];
    const violations = [];
    
    for (let i = 0; i < count; i++) {
      const detectedAt = faker.date.recent({ days: 60 });
      const resolutionDeadline = new Date(detectedAt);
      resolutionDeadline.setDate(resolutionDeadline.getDate() + faker.number.int({ min: 7, max: 30 }));
      const status = faker.helpers.arrayElement(statuses);
      
      violations.push({
        id: uuidv4(),
        violation_type: faker.helpers.arrayElement(violationTypes),
        severity: faker.helpers.arrayElement(severities),
        entity_type: 'authorization_request',
        entity_id: faker.helpers.arrayElement(entityIds),
        description: faker.lorem.paragraph(),
        regulatory_reference: `REG-${faker.string.alphanumeric(6).toUpperCase()}`,
        detected_by: faker.helpers.arrayElement(['system', 'audit', 'complaint']),
        status,
        resolution_required_by: resolutionDeadline,
        resolution_notes: status === 'remediated' ? faker.lorem.sentence() : null,
        detected_at: detectedAt,
        resolved_at: status === 'remediated' ? faker.date.recent({ days: 10 }) : null
      });
    }
    
    return violations;
  }
  
  private generatePerformanceMetrics(count: number): any[] {
    const metricTypes = ['system', 'business', 'quality', 'compliance'];
    const metricNames = [
      'response_time_ms', 'throughput_per_min', 'error_rate',
      'authorization_turnaround_hours', 'approval_rate', 'appeal_rate',
      'accuracy_score', 'user_satisfaction', 'ai_confidence',
      'compliance_score', 'audit_pass_rate', 'violation_count'
    ];
    const metrics = [];
    
    for (let i = 0; i < count; i++) {
      const periodStart = faker.date.recent({ days: 90 });
      const periodEnd = new Date(periodStart);
      periodEnd.setHours(periodEnd.getHours() + 1);
      
      metrics.push({
        id: uuidv4(),
        metric_type: faker.helpers.arrayElement(metricTypes),
        metric_name: faker.helpers.arrayElement(metricNames),
        metric_value: faker.number.float({ min: 0, max: 1000, fractionDigits: 2 }),
        dimensions: JSON.stringify({
          region: faker.helpers.arrayElement(['north', 'south', 'east', 'west']),
          department: faker.helpers.arrayElement(['emergency', 'surgery', 'radiology'])
        }),
        period_start: periodStart,
        period_end: periodEnd,
        calculated_at: periodEnd
      });
    }
    
    return metrics;
  }
  
  private generateProviderMetrics(organizationIds: string[], days: number): any[] {
    const metrics = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    for (const orgId of organizationIds) {
      for (let d = 0; d < days; d++) {
        const metricDate = new Date(startDate);
        metricDate.setDate(metricDate.getDate() + d);
        
        const totalAuths = faker.number.int({ min: 50, max: 200 });
        const approved = Math.floor(totalAuths * faker.number.float({ min: 0.6, max: 0.95 }));
        
        metrics.push({
          id: uuidv4(),
          provider_id: orgId,
          metric_date: metricDate,
          total_authorizations: totalAuths,
          approved_authorizations: approved,
          denied_authorizations: totalAuths - approved,
          approval_rate: approved / totalAuths,
          average_processing_time_hours: faker.number.float({ min: 1, max: 48, fractionDigits: 1 }),
          fraud_incidents: faker.number.int({ min: 0, max: 5 }),
          compliance_score: faker.number.float({ min: 0.8, max: 1, fractionDigits: 3 }),
          quality_score: faker.number.float({ min: 0.7, max: 1, fractionDigits: 3 })
        });
      }
    }
    
    return metrics;
  }
  
  private generateUserActivitySummary(userIds: string[], days: number): any[] {
    const summaries = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    for (const userId of userIds.slice(0, 50)) { // Limit to 50 users for reasonable data size
      for (let d = 0; d < days; d++) {
        const activityDate = new Date(startDate);
        activityDate.setDate(activityDate.getDate() + d);
        
        const totalDecisions = faker.number.int({ min: 10, max: 100 });
        const approvals = Math.floor(totalDecisions * faker.number.float({ min: 0.5, max: 0.9 }));
        
        summaries.push({
          id: uuidv4(),
          user_id: userId,
          activity_date: activityDate,
          total_decisions: totalDecisions,
          approvals: approvals,
          denials: totalDecisions - approvals,
          average_decision_time_minutes: faker.number.float({ min: 5, max: 60, fractionDigits: 1 }),
          overrides: faker.number.int({ min: 0, max: totalDecisions * 0.1 }),
          ai_agreement_rate: faker.number.float({ min: 0.7, max: 0.95, fractionDigits: 3 })
        });
      }
    }
    
    return summaries;
  }

  /**
   * Utility methods
   */
  private async batchInsert(
    client: PoolClient, 
    tableName: string, 
    data: any[], 
    columns: string[],
    options: SeedingOptions
  ): Promise<void> {
    if (data.length === 0) return;

    const batches = this.chunkArray(data, options.batchSize);
    let insertedCount = 0;

    for (const batch of batches) {
      const values = batch.flatMap(row => columns.map(col => row[col]));
      
      const placeholdersWithTimestamps = batch.map((_, rowIndex) => {
        const valuePlaceholders = columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(',');
        return `(${valuePlaceholders}, NOW(), NOW())`;
      }).join(',');
      
      const query = `
        INSERT INTO ${tableName} (${columns.join(',')}, created_at, updated_at)
        VALUES ${placeholdersWithTimestamps}
        ON CONFLICT DO NOTHING
      `;

      await client.query(query, values);
      insertedCount += batch.length;

      if (options.logProgress && insertedCount % (options.batchSize * 10) === 0) {
        console.log(`  📊 Inserted ${insertedCount}/${data.length} records into ${tableName}`);
      }
    }

    this.stats.recordsByTable.set(tableName, insertedCount);
    this.stats.totalRecords += insertedCount;
    
    if (options.logProgress) {
      console.log(`✅ Seeded ${tableName}: ${insertedCount} records`);
    }
  }

  private async getEntityIds(client: PoolClient, tableName: string): Promise<string[]> {
    const result = await client.query(`SELECT id FROM ${tableName} ORDER BY created_at`);
    return result.rows.map(row => row.id);
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async clearTestData(client: PoolClient): Promise<void> {
    const tables = [
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

    for (const table of tables) {
      await client.query(`TRUNCATE TABLE ${table} CASCADE`);
    }

    console.log('🧹 Cleared existing test data');
  }

  private async disableConstraints(client: PoolClient): Promise<void> {
    await client.query('SET session_replication_role = replica');
  }

  private async enableConstraints(client: PoolClient): Promise<void> {
    await client.query('SET session_replication_role = DEFAULT');
  }

  private logSeedingStats(): void {
    const duration = this.stats.endTime!.getTime() - this.stats.startTime.getTime();
    console.log('\n📈 Seeding Statistics:');
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📊 Total Records: ${this.stats.totalRecords}`);
    console.log(`🗄️  Tables Seeded: ${this.stats.tablesSeeded}`);
    
    if (this.stats.recordsByTable.size > 0) {
      console.log('\n📋 Records by Table:');
      for (const [table, count] of this.stats.recordsByTable.entries()) {
        console.log(`   ${table}: ${count}`);
      }
    }

    if (this.stats.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.stats.errors.forEach(error => console.log(`   ${error}`));
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
  }
}

// Export convenience functions
export const createSeeder = (connectionString: string) => 
  new TestDatabaseSeeder(connectionString);

export const seedTestDatabase = async (
  connectionString: string, 
  options?: Partial<SeedingOptions>
): Promise<SeedingStats> => {
  const seeder = new TestDatabaseSeeder(connectionString);
  try {
    return await seeder.seedDatabase({
      batchSize: 100,
      enableConstraints: true,
      preserveExisting: false,
      logProgress: true,
      ...options
    });
  } finally {
    await seeder.disconnect();
  }
};