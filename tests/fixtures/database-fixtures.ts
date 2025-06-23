/**
 * Comprehensive Database Fixtures for AUSTA Cockpit Testing
 * Based on PostgreSQL schema with 5 schemas: auth, medical, ai, audit, analytics
 */

import { faker } from '@faker-js/faker';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { addDays, addMonths, subDays, subMonths } from 'date-fns';

// Type definitions for database fixtures
interface Organization {
  id: string;
  name: string;
  type: 'provider' | 'insurer' | 'auditor';
  tax_id: string;
  status: 'active' | 'inactive';
  metadata: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

interface User {
  id: string;
  organization_id: string | null;
  email: string;
  password_hash: string;
  full_name: string;
  role: 'admin' | 'doctor' | 'auditor' | 'analyst';
  license_number: string | null;
  specialization: string | null;
  status: 'active' | 'inactive' | 'locked';
  last_login: Date | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  metadata: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

interface Permission {
  id: string;
  resource: string;
  action: string;
  description: string;
  created_at?: Date;
  updated_at?: Date;
}

// Schema-based fixtures for PostgreSQL database
export const DatabaseFixtures = {
  // AUTH SCHEMA FIXTURES
  auth: {
    organizations: [
      {
        id: uuidv4(),
        name: 'Metro General Hospital',
        type: 'provider',
        tax_id: '12-3456789',
        status: 'active',
        metadata: { 
          location: 'New York, NY',
          beds: 500,
          specialties: ['cardiology', 'oncology', 'neurology']
        }
      },
      {
        id: uuidv4(),
        name: 'HealthFirst Insurance',
        type: 'insurer',
        tax_id: '98-7654321',
        status: 'active',
        metadata: {
          memberCount: 250000,
          regions: ['Northeast', 'Southeast']
        }
      },
      {
        id: uuidv4(),
        name: 'Regulatory Compliance Corp',
        type: 'auditor',
        tax_id: '55-9988776',
        status: 'active',
        metadata: {
          accreditations: ['NCQA', 'Joint Commission']
        }
      }
    ],

    users: [
      {
        id: uuidv4(),
        organization_id: null, // Will be linked to organizations
        email: 'admin@austa.com',
        password_hash: bcrypt.hashSync('AdminPass123!', 10),
        full_name: 'System Administrator',
        role: 'admin',
        license_number: null,
        specialization: null,
        status: 'active',
        last_login: new Date(),
        failed_login_attempts: 0,
        locked_until: null,
        metadata: { permissions: ['all'] }
      },
      {
        id: uuidv4(),
        organization_id: null,
        email: 'dr.smith@metro.com',
        password_hash: bcrypt.hashSync('DoctorPass123!', 10),
        full_name: 'Dr. Sarah Smith',
        role: 'doctor',
        license_number: 'MD123456',
        specialization: 'Cardiology',
        status: 'active',
        last_login: faker.date.recent({ days: 30 }),
        failed_login_attempts: 0,
        locked_until: null,
        metadata: { department: 'Cardiac Care', years_experience: 15 }
      },
      {
        id: uuidv4(),
        organization_id: null,
        email: 'jane.auditor@compliance.com',
        password_hash: bcrypt.hashSync('AuditPass123!', 10),
        full_name: 'Jane Auditor',
        role: 'auditor',
        license_number: 'AUD789',
        specialization: 'Healthcare Compliance',
        status: 'active',
        last_login: faker.date.recent({ days: 30 }),
        failed_login_attempts: 0,
        locked_until: null,
        metadata: { certifications: ['CHA', 'RHIA'] }
      },
      {
        id: uuidv4(),
        organization_id: null,
        email: 'ai.analyst@austa.com',
        password_hash: bcrypt.hashSync('AnalystPass123!', 10),
        full_name: 'AI Data Analyst',
        role: 'analyst',
        license_number: null,
        specialization: 'Healthcare Analytics',
        status: 'active',
        last_login: faker.date.recent({ days: 30 }),
        failed_login_attempts: 0,
        locked_until: null,
        metadata: { ai_clearance_level: 'level_3' }
      }
    ],

    permissions: [
      { id: uuidv4(), resource: 'cases', action: 'read', description: 'Read case information' },
      { id: uuidv4(), resource: 'cases', action: 'write', description: 'Create and update cases' },
      { id: uuidv4(), resource: 'cases', action: 'delete', description: 'Delete cases' },
      { id: uuidv4(), resource: 'authorizations', action: 'approve', description: 'Approve authorization requests' },
      { id: uuidv4(), resource: 'authorizations', action: 'deny', description: 'Deny authorization requests' },
      { id: uuidv4(), resource: 'reports', action: 'generate', description: 'Generate system reports' },
      { id: uuidv4(), resource: 'audit', action: 'view', description: 'View audit logs' },
      { id: uuidv4(), resource: 'ai', action: 'configure', description: 'Configure AI models' }
    ]
  },

  // MEDICAL SCHEMA FIXTURES
  medical: {
    patients: [
      {
        id: uuidv4(),
        patient_code: 'PAT-001-2024',
        birth_year: 1985,
        gender: 'female',
        insurance_type: 'PPO',
        risk_category: 'medium',
        chronic_conditions: ['diabetes', 'hypertension'],
        metadata: { 
          anonymized_zip: '10001',
          insurance_tier: 'premium'
        }
      },
      {
        id: uuidv4(),
        patient_code: 'PAT-002-2024',
        birth_year: 1972,
        gender: 'male',
        insurance_type: 'HMO',
        risk_category: 'high',
        chronic_conditions: ['heart_disease', 'diabetes', 'copd'],
        metadata: {
          anonymized_zip: '10002',
          insurance_tier: 'standard'
        }
      },
      {
        id: uuidv4(),
        patient_code: 'PAT-003-2024',
        birth_year: 1995,
        gender: 'female',
        insurance_type: 'EPO',
        risk_category: 'low',
        chronic_conditions: [],
        metadata: {
          anonymized_zip: '10003',
          insurance_tier: 'basic'
        }
      }
    ],

    procedures: [
      {
        id: uuidv4(),
        code: 'CPT-93458',
        name: 'Cardiac Catheterization',
        category: 'Cardiovascular',
        subcategory: 'Diagnostic',
        typical_duration_minutes: 90,
        requires_preauth: true,
        risk_level: 'medium',
        guidelines: {
          indications: ['chest pain', 'abnormal stress test'],
          contraindications: ['severe renal dysfunction'],
          prior_auth_criteria: ['failed conservative treatment', 'high risk factors']
        }
      },
      {
        id: uuidv4(),
        code: 'CPT-99213',
        name: 'Office Visit - Established Patient',
        category: 'Evaluation and Management',
        subcategory: 'Office Visit',
        typical_duration_minutes: 20,
        requires_preauth: false,
        risk_level: 'low',
        guidelines: {
          documentation_requirements: ['chief complaint', 'history', 'physical exam']
        }
      },
      {
        id: uuidv4(),
        code: 'CPT-27447',
        name: 'Total Knee Replacement',
        category: 'Orthopedic Surgery',
        subcategory: 'Joint Replacement',
        typical_duration_minutes: 120,
        requires_preauth: true,
        risk_level: 'high',
        guidelines: {
          indications: ['severe arthritis', 'failed conservative treatment'],
          preop_requirements: ['imaging', 'medical clearance']
        }
      }
    ],

    authorization_requests: [
      {
        id: uuidv4(),
        request_number: 'AUTH-2024-001',
        patient_id: null, // Will be linked
        requesting_provider_id: null, // Will be linked
        requesting_doctor_id: null, // Will be linked
        procedure_id: null, // Will be linked
        urgency_level: 'routine',
        clinical_justification: 'Patient presents with chest pain and abnormal stress test. Cardiac catheterization recommended to evaluate coronary artery disease.',
        diagnosis_codes: ['I25.10', 'R06.02'],
        supporting_documents: [
          { type: 'stress_test_report', filename: 'stress_test_2024_001.pdf' },
          { type: 'ekg', filename: 'ekg_12_lead.pdf' }
        ],
        status: 'pending',
        submitted_at: faker.date.recent(),
        due_date: addDays(new Date(), 5)
      },
      {
        id: uuidv4(),
        request_number: 'AUTH-2024-002',
        patient_id: null,
        requesting_provider_id: null,
        requesting_doctor_id: null,
        procedure_id: null,
        urgency_level: 'urgent',
        clinical_justification: 'Patient with severe knee pain and mobility issues. Conservative treatment has failed. Total knee replacement is medically necessary.',
        diagnosis_codes: ['M17.11', 'M25.561'],
        supporting_documents: [
          { type: 'xray', filename: 'knee_xray_2024.pdf' },
          { type: 'mri', filename: 'knee_mri_2024.pdf' },
          { type: 'pt_notes', filename: 'physical_therapy_notes.pdf' }
        ],
        status: 'in_review',
        submitted_at: subDays(new Date(), 2),
        due_date: addDays(new Date(), 3)
      }
    ],

    authorization_decisions: [
      {
        id: uuidv4(),
        authorization_request_id: null, // Will be linked
        decision_type: 'ai_assisted',
        decision: 'approved',
        reviewer_id: null, // Will be linked
        decision_rationale: 'Authorization approved based on clinical guidelines and AI risk assessment. Patient meets all criteria for cardiac catheterization.',
        conditions_applied: [
          'Must be performed at accredited facility',
          'Requires cardiologist supervision'
        ],
        valid_from: new Date(),
        valid_until: addMonths(new Date(), 6),
        appeal_deadline: addDays(new Date(), 30),
        decided_at: faker.date.recent()
      }
    ],

    claims: [
      {
        id: uuidv4(),
        claim_number: 'CLM-2024-001',
        authorization_id: null, // Will be linked
        patient_id: null, // Will be linked
        provider_id: null, // Will be linked
        procedure_id: null, // Will be linked
        service_date: faker.date.recent({ days: 7 }),
        billed_amount: 15000.00,
        allowed_amount: 12000.00,
        paid_amount: 10800.00,
        status: 'paid',
        denial_reason: null,
        processed_at: faker.date.recent({ days: 2 })
      }
    ]
  },

  // AI SCHEMA FIXTURES
  ai: {
    models: [
      {
        id: uuidv4(),
        name: 'Authorization Decision Engine',
        version: 'v2.1.0',
        type: 'authorization',
        status: 'active',
        accuracy_score: 94.5,
        configuration: {
          threshold: 0.85,
          features: ['diagnosis_codes', 'procedure_complexity', 'patient_history'],
          model_type: 'random_forest'
        },
        deployed_at: faker.date.past({ years: 1 })
      },
      {
        id: uuidv4(),
        name: 'Fraud Detection Neural Network',
        version: 'v1.8.2',
        type: 'fraud_detection',
        status: 'active',
        accuracy_score: 91.2,
        configuration: {
          threshold: 0.75,
          features: ['billing_patterns', 'provider_history', 'claim_amounts'],
          model_type: 'neural_network'
        },
        deployed_at: subMonths(new Date(), 6)
      },
      {
        id: uuidv4(),
        name: 'Risk Assessment Model',
        version: 'v3.0.1',
        type: 'risk_assessment',
        status: 'active',
        accuracy_score: 89.7,
        configuration: {
          threshold: 0.70,
          features: ['patient_comorbidities', 'procedure_complexity', 'provider_quality'],
          model_type: 'gradient_boosting'
        },
        deployed_at: subMonths(new Date(), 3)
      }
    ],

    fraud_indicators: [
      {
        id: uuidv4(),
        name: 'Unusual Billing Pattern',
        category: 'Billing Anomaly',
        severity: 'high',
        detection_logic: {
          rule_type: 'statistical',
          threshold: 3.0,
          comparison: 'standard_deviations',
          timeframe: '30_days'
        },
        active: true
      },
      {
        id: uuidv4(),
        name: 'Duplicate Services Same Day',
        category: 'Service Duplication',
        severity: 'medium',
        detection_logic: {
          rule_type: 'pattern_match',
          criteria: 'same_patient_same_procedure_same_day',
          exceptions: ['bilateral_procedures']
        },
        active: true
      },
      {
        id: uuidv4(),
        name: 'Excessive Diagnostic Testing',
        category: 'Overutilization',
        severity: 'medium',
        detection_logic: {
          rule_type: 'frequency',
          threshold: 5,
          timeframe: '7_days',
          procedure_categories: ['diagnostic_imaging', 'lab_tests']
        },
        active: true
      }
    ]
  },

  // AUDIT SCHEMA FIXTURES
  audit: {
    activity_logs: [
      {
        id: uuidv4(),
        user_id: null, // Will be linked
        organization_id: null, // Will be linked
        action: 'authorization_approved',
        entity_type: 'authorization_request',
        entity_id: null, // Will be linked
        ip_address: '192.168.1.100',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        request_id: uuidv4(),
        changes: {
          status: { from: 'pending', to: 'approved' },
          reviewer_assigned: true
        },
        metadata: {
          decision_method: 'ai_assisted',
          confidence_score: 0.92
        }
      }
    ],

    compliance_violations: [
      {
        id: uuidv4(),
        violation_type: 'Documentation Incomplete',
        severity: 'moderate',
        entity_type: 'authorization_request',
        entity_id: null, // Will be linked
        description: 'Authorization request missing required clinical documentation for high-risk procedure',
        regulatory_reference: 'HIPAA Section 164.312(a)',
        detected_by: 'system',
        status: 'open',
        resolution_required_by: addDays(new Date(), 30),
        resolution_notes: null,
        detected_at: faker.date.recent()
      }
    ]
  },

  // ANALYTICS SCHEMA FIXTURES
  analytics: {
    performance_metrics: [
      {
        id: uuidv4(),
        metric_type: 'authorization_processing',
        metric_name: 'average_processing_time_hours',
        metric_value: 18.5,
        dimensions: {
          organization_type: 'hospital',
          procedure_category: 'cardiovascular',
          urgency_level: 'routine'
        },
        period_start: faker.date.recent({ days: 7 }),
        period_end: faker.date.recent({ days: 1 }),
        calculated_at: faker.date.recent()
      },
      {
        id: uuidv4(),
        metric_type: 'fraud_detection',
        metric_name: 'detection_accuracy_rate',
        metric_value: 94.2,
        dimensions: {
          model_version: 'v1.8.2',
          detection_type: 'billing_anomaly'
        },
        period_start: faker.date.recent({ days: 30 }),
        period_end: faker.date.recent({ days: 1 }),
        calculated_at: faker.date.recent()
      }
    ],

    provider_metrics: [
      {
        id: uuidv4(),
        provider_id: null, // Will be linked
        metric_date: faker.date.recent({ days: 1 }),
        total_authorizations: 45,
        approved_authorizations: 38,
        denied_authorizations: 7,
        approval_rate: 84.4,
        average_processing_time_hours: 16.2,
        fraud_incidents: 2,
        compliance_score: 92.1,
        quality_score: 88.7
      }
    ]
  }
};

// Test data factory functions
export class TestDataFactory {
  static generatePatients(count: number = 10) {
    return Array.from({ length: count }, () => ({
      id: uuidv4(),
      patient_code: `PAT-${faker.string.numeric(3)}-2024`,
      birth_year: faker.date.birthdate({ min: 1940, max: 2005, mode: 'year' }),
      gender: faker.person.sexType(),
      insurance_type: faker.helpers.arrayElement(['PPO', 'HMO', 'EPO', 'POS']),
      risk_category: faker.helpers.arrayElement(['low', 'medium', 'high', 'critical']),
      chronic_conditions: faker.helpers.arrayElements(
        ['diabetes', 'hypertension', 'heart_disease', 'copd', 'arthritis'],
        { min: 0, max: 3 }
      ),
      metadata: {
        anonymized_zip: faker.location.zipCode(),
        insurance_tier: faker.helpers.arrayElement(['basic', 'standard', 'premium'])
      }
    }));
  }

  static generateAuthorizationRequests(count: number = 20) {
    return Array.from({ length: count }, () => ({
      id: uuidv4(),
      request_number: `AUTH-2024-${faker.string.numeric(3)}`,
      urgency_level: faker.helpers.arrayElement(['routine', 'urgent', 'emergency']),
      clinical_justification: faker.lorem.paragraph(),
      diagnosis_codes: faker.helpers.arrayElements(
        ['I25.10', 'R06.02', 'M17.11', 'M25.561', 'E11.9'],
        { min: 1, max: 3 }
      ),
      supporting_documents: [
        {
          type: faker.helpers.arrayElement(['xray', 'mri', 'lab_report', 'progress_note']),
          filename: faker.system.fileName()
        }
      ],
      status: faker.helpers.arrayElement(['pending', 'in_review', 'approved', 'denied']),
      submitted_at: subDays(new Date(), faker.number.int({ min: 1, max: 30 })),
      due_date: addDays(new Date(), faker.number.int({ min: 1, max: 15 }))
    }));
  }

  static generateFraudDetections(count: number = 15) {
    return Array.from({ length: count }, () => ({
      id: uuidv4(),
      entity_type: faker.helpers.arrayElement(['authorization', 'claim', 'provider']),
      entity_id: uuidv4(),
      confidence_score: faker.number.float({ min: 70, max: 99, fractionDigits: 1 }),
      evidence: {
        anomaly_type: faker.helpers.arrayElement(['billing_pattern', 'frequency', 'amount']),
        severity_score: faker.number.float({ min: 0.5, max: 1.0, fractionDigits: 2 }),
        contributing_factors: faker.helpers.arrayElements([
          'unusual_timing', 'high_frequency', 'amount_deviation', 'pattern_match'
        ])
      },
      status: faker.helpers.arrayElement(['pending', 'investigating', 'confirmed', 'dismissed']),
      detected_at: faker.date.recent({ days: 60 })
    }));
  }

  static generateAnalysisResults(count: number = 25) {
    return Array.from({ length: count }, () => ({
      id: uuidv4(),
      entity_type: faker.helpers.arrayElement(['authorization', 'claim', 'provider', 'patient']),
      entity_id: uuidv4(),
      analysis_type: faker.helpers.arrayElement(['risk_assessment', 'fraud_detection', 'quality_check']),
      confidence_score: faker.number.float({ min: 60, max: 99, fractionDigits: 1 }),
      risk_score: faker.number.float({ min: 0, max: 100, fractionDigits: 1 }),
      recommendations: faker.helpers.arrayElements([
        'approve_with_conditions', 'request_additional_documentation', 'deny_authorization',
        'escalate_for_review', 'flag_for_investigation'
      ], { min: 1, max: 3 }),
      findings: {
        key_factors: faker.helpers.arrayElements([
          'patient_history', 'procedure_complexity', 'provider_quality', 'cost_effectiveness'
        ]),
        risk_indicators: faker.helpers.arrayElements([
          'high_cost', 'experimental_procedure', 'provider_history', 'patient_complexity'
        ])
      },
      processing_time_ms: faker.number.int({ min: 100, max: 5000 }),
      analyzed_at: faker.date.recent({ days: 30 })
    }));
  }

  // Seed database with realistic test data
  static generateComprehensiveTestDataset() {
    return {
      patients: this.generatePatients(100),
      authorization_requests: this.generateAuthorizationRequests(200),
      fraud_detections: this.generateFraudDetections(50),
      analysis_results: this.generateAnalysisResults(300),
      // Add performance data for different time periods
      daily_metrics: Array.from({ length: 30 }, (_, i) => ({
        date: faker.date.recent({ days: i }),
        authorizations_processed: faker.number.int({ min: 20, max: 100 }),
        approval_rate: faker.number.float({ min: 70, max: 95, fractionDigits: 1 }),
        avg_processing_time: faker.number.float({ min: 8, max: 48, fractionDigits: 1 }),
        fraud_detections: faker.number.int({ min: 0, max: 8 })
      }))
    };
  }
}

// Database seeding utilities
export const DatabaseSeeder = {
  async seedFixtures(prisma: any) {
    // Implementation would depend on the actual ORM/database connection
    console.log('Seeding test fixtures...');
    // This would contain the actual database insertion logic
  },

  async clearTestData(prisma: any) {
    console.log('Clearing test data...');
    // This would contain the cleanup logic
  }
};