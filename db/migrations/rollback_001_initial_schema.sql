-- Rollback for migration: 001_initial_schema
-- Description: Rollback initial database schema for AUSTA Cockpit
-- Created: 2025-06-22

BEGIN;

-- Drop all tables in reverse order of dependencies
-- Analytics schema
DROP TABLE IF EXISTS analytics.user_activity_summary CASCADE;
DROP TABLE IF EXISTS analytics.provider_metrics CASCADE;
DROP TABLE IF EXISTS analytics.performance_metrics CASCADE;

-- Audit schema
DROP TABLE IF EXISTS audit.compliance_violations CASCADE;
DROP TABLE IF EXISTS audit.decision_trails CASCADE;
DROP TABLE IF EXISTS audit.activity_logs CASCADE;

-- AI schema
DROP TABLE IF EXISTS ai.fraud_detections CASCADE;
DROP TABLE IF EXISTS ai.fraud_indicators CASCADE;
DROP TABLE IF EXISTS ai.analysis_results CASCADE;
DROP TABLE IF EXISTS ai.models CASCADE;

-- Medical schema
DROP TABLE IF EXISTS medical.claims CASCADE;
DROP TABLE IF EXISTS medical.authorization_decisions CASCADE;
DROP TABLE IF EXISTS medical.authorization_requests CASCADE;
DROP TABLE IF EXISTS medical.procedures CASCADE;
DROP TABLE IF EXISTS medical.patients CASCADE;

-- Auth schema
DROP TABLE IF EXISTS auth.role_permissions CASCADE;
DROP TABLE IF EXISTS auth.permissions CASCADE;
DROP TABLE IF EXISTS auth.sessions CASCADE;
DROP TABLE IF EXISTS auth.users CASCADE;
DROP TABLE IF EXISTS auth.organizations CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop schemas
DROP SCHEMA IF EXISTS analytics CASCADE;
DROP SCHEMA IF EXISTS audit CASCADE;
DROP SCHEMA IF EXISTS ai CASCADE;
DROP SCHEMA IF EXISTS medical CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;

-- Drop extensions
DROP EXTENSION IF EXISTS pg_trgm CASCADE;
DROP EXTENSION IF EXISTS pgcrypto CASCADE;
DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;

-- Remove migration record
DELETE FROM public.schema_migrations WHERE version = '001_initial_schema';

COMMIT;