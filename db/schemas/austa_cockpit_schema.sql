-- AUSTA Cockpit Database Schema
-- Healthcare Quality Control and Authorization Management System
-- PostgreSQL Database Schema

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search optimization

-- Create schemas for logical separation
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS medical;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS analytics;

-- =====================================================
-- AUTHENTICATION AND USER MANAGEMENT
-- =====================================================

-- Organizations (Healthcare providers, insurers, etc.)
CREATE TABLE auth.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('provider', 'insurer', 'administrator', 'auditor')),
    tax_id VARCHAR(50) UNIQUE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES auth.organizations(id) ON DELETE SET NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'doctor', 'nurse', 'auditor', 'analyst', 'reviewer')),
    license_number VARCHAR(100),
    specialization VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive', 'pending')),
    last_login TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User sessions
CREATE TABLE auth.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Role permissions
CREATE TABLE auth.permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource, action)
);

-- Role-permission mapping
CREATE TABLE auth.role_permissions (
    role VARCHAR(50) NOT NULL,
    permission_id UUID NOT NULL REFERENCES auth.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role, permission_id)
);

-- =====================================================
-- MEDICAL CASES AND AUTHORIZATIONS
-- =====================================================

-- Patients (anonymized for privacy)
CREATE TABLE medical.patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_code VARCHAR(100) UNIQUE NOT NULL, -- Anonymized identifier
    birth_year INTEGER,
    gender VARCHAR(20),
    insurance_type VARCHAR(50),
    risk_category VARCHAR(20) CHECK (risk_category IN ('low', 'medium', 'high', 'critical')),
    chronic_conditions JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Medical procedures catalog
CREATE TABLE medical.procedures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    typical_duration_minutes INTEGER,
    requires_preauth BOOLEAN DEFAULT false,
    risk_level VARCHAR(20) DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
    guidelines JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Authorization requests
CREATE TABLE medical.authorization_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_number VARCHAR(100) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES medical.patients(id),
    requesting_provider_id UUID NOT NULL REFERENCES auth.organizations(id),
    requesting_doctor_id UUID NOT NULL REFERENCES auth.users(id),
    procedure_id UUID NOT NULL REFERENCES medical.procedures(id),
    urgency_level VARCHAR(20) NOT NULL CHECK (urgency_level IN ('routine', 'urgent', 'emergency')),
    clinical_justification TEXT NOT NULL,
    diagnosis_codes JSONB NOT NULL DEFAULT '[]',
    supporting_documents JSONB DEFAULT '[]',
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'approved', 'denied', 'expired', 'cancelled')),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Authorization decisions
CREATE TABLE medical.authorization_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    authorization_request_id UUID NOT NULL REFERENCES medical.authorization_requests(id),
    decision_type VARCHAR(20) NOT NULL CHECK (decision_type IN ('automatic', 'manual', 'ai_assisted')),
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved', 'denied', 'partial', 'deferred')),
    reviewer_id UUID REFERENCES auth.users(id),
    decision_rationale TEXT NOT NULL,
    conditions_applied JSONB DEFAULT '[]',
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    appeal_deadline TIMESTAMP WITH TIME ZONE,
    decided_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Medical claims
CREATE TABLE medical.claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_number VARCHAR(100) UNIQUE NOT NULL,
    authorization_id UUID REFERENCES medical.authorization_requests(id),
    patient_id UUID NOT NULL REFERENCES medical.patients(id),
    provider_id UUID NOT NULL REFERENCES auth.organizations(id),
    procedure_id UUID NOT NULL REFERENCES medical.procedures(id),
    service_date DATE NOT NULL,
    billed_amount DECIMAL(10, 2) NOT NULL,
    allowed_amount DECIMAL(10, 2),
    paid_amount DECIMAL(10, 2),
    status VARCHAR(50) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'processing', 'approved', 'denied', 'appealed', 'paid')),
    denial_reason VARCHAR(255),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- AI ANALYSIS AND INSIGHTS
-- =====================================================

-- AI models registry
CREATE TABLE ai.models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('authorization', 'fraud_detection', 'risk_assessment', 'pattern_analysis')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'training', 'deprecated', 'inactive')),
    accuracy_score DECIMAL(5, 2),
    configuration JSONB DEFAULT '{}',
    deployed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, version)
);

-- AI analysis results
CREATE TABLE ai.analysis_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES ai.models(id),
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('authorization', 'claim', 'provider', 'patient')),
    entity_id UUID NOT NULL,
    analysis_type VARCHAR(50) NOT NULL,
    confidence_score DECIMAL(5, 2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    risk_score DECIMAL(5, 2) CHECK (risk_score >= 0 AND risk_score <= 100),
    recommendations JSONB DEFAULT '[]',
    findings JSONB DEFAULT '{}',
    processing_time_ms INTEGER,
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Fraud indicators
CREATE TABLE ai.fraud_indicators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    detection_logic JSONB NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Fraud detections
CREATE TABLE ai.fraud_detections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('authorization', 'claim', 'provider', 'patient')),
    entity_id UUID NOT NULL,
    indicator_id UUID NOT NULL REFERENCES ai.fraud_indicators(id),
    confidence_score DECIMAL(5, 2) NOT NULL,
    evidence JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'confirmed', 'dismissed')),
    investigator_id UUID REFERENCES auth.users(id),
    resolution_notes TEXT,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- AUDIT AND COMPLIANCE
-- =====================================================

-- Audit logs
CREATE TABLE audit.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    organization_id UUID REFERENCES auth.organizations(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    changes JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Decision audit trail
CREATE TABLE audit.decision_trails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    decision_id UUID NOT NULL,
    decision_type VARCHAR(50) NOT NULL,
    decision_maker_id UUID REFERENCES auth.users(id),
    decision_maker_type VARCHAR(20) CHECK (decision_maker_type IN ('human', 'ai', 'system')),
    factors_considered JSONB NOT NULL,
    rules_applied JSONB DEFAULT '[]',
    override_reason TEXT,
    compliance_checks JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Compliance violations
CREATE TABLE audit.compliance_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    violation_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('minor', 'moderate', 'major', 'critical')),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    description TEXT NOT NULL,
    regulatory_reference VARCHAR(255),
    detected_by VARCHAR(20) CHECK (detected_by IN ('system', 'ai', 'manual')),
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'escalated')),
    resolution_required_by DATE,
    resolution_notes TEXT,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ANALYTICS AND METRICS
-- =====================================================

-- Performance metrics
CREATE TABLE analytics.performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_type VARCHAR(100) NOT NULL,
    metric_name VARCHAR(255) NOT NULL,
    metric_value DECIMAL(20, 4) NOT NULL,
    dimensions JSONB DEFAULT '{}',
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Provider performance
CREATE TABLE analytics.provider_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES auth.organizations(id),
    metric_date DATE NOT NULL,
    total_authorizations INTEGER DEFAULT 0,
    approved_authorizations INTEGER DEFAULT 0,
    denied_authorizations INTEGER DEFAULT 0,
    approval_rate DECIMAL(5, 2),
    average_processing_time_hours DECIMAL(10, 2),
    fraud_incidents INTEGER DEFAULT 0,
    compliance_score DECIMAL(5, 2),
    quality_score DECIMAL(5, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, metric_date)
);

-- User activity analytics
CREATE TABLE analytics.user_activity_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    activity_date DATE NOT NULL,
    total_decisions INTEGER DEFAULT 0,
    approvals INTEGER DEFAULT 0,
    denials INTEGER DEFAULT 0,
    average_decision_time_minutes DECIMAL(10, 2),
    overrides INTEGER DEFAULT 0,
    ai_agreement_rate DECIMAL(5, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, activity_date)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Authentication indexes
CREATE INDEX idx_users_email ON auth.users(email);
CREATE INDEX idx_users_organization ON auth.users(organization_id);
CREATE INDEX idx_sessions_token ON auth.sessions(token_hash);
CREATE INDEX idx_sessions_user ON auth.sessions(user_id);

-- Medical indexes
CREATE INDEX idx_auth_requests_patient ON medical.authorization_requests(patient_id);
CREATE INDEX idx_auth_requests_provider ON medical.authorization_requests(requesting_provider_id);
CREATE INDEX idx_auth_requests_status ON medical.authorization_requests(status);
CREATE INDEX idx_auth_requests_submitted ON medical.authorization_requests(submitted_at);
CREATE INDEX idx_claims_authorization ON medical.claims(authorization_id);
CREATE INDEX idx_claims_status ON medical.claims(status);

-- AI indexes
CREATE INDEX idx_analysis_entity ON ai.analysis_results(entity_type, entity_id);
CREATE INDEX idx_fraud_entity ON ai.fraud_detections(entity_type, entity_id);
CREATE INDEX idx_fraud_status ON ai.fraud_detections(status);

-- Audit indexes
CREATE INDEX idx_audit_logs_user ON audit.activity_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit.activity_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit.activity_logs(created_at);

-- Analytics indexes
CREATE INDEX idx_metrics_type_period ON analytics.performance_metrics(metric_type, period_start, period_end);
CREATE INDEX idx_provider_metrics_date ON analytics.provider_metrics(provider_id, metric_date);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =====================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON auth.organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON medical.patients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_procedures_updated_at BEFORE UPDATE ON medical.procedures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_auth_requests_updated_at BEFORE UPDATE ON medical.authorization_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_claims_updated_at BEFORE UPDATE ON medical.claims FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fraud_indicators_updated_at BEFORE UPDATE ON ai.fraud_indicators FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on sensitive tables
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical.authorization_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.activity_logs ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (to be customized based on requirements)
CREATE POLICY users_organization_isolation ON auth.users
    FOR ALL
    USING (organization_id = current_setting('app.current_organization_id')::UUID);

CREATE POLICY patients_provider_access ON medical.patients
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM medical.authorization_requests ar
            WHERE ar.patient_id = patients.id
            AND ar.requesting_provider_id = current_setting('app.current_organization_id')::UUID
        )
    );