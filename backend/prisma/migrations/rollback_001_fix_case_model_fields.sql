-- ROLLBACK Migration: Fix Case model missing fields and relations
-- Date: 2025-06-22
-- Description: Rollback changes made in 001_fix_case_model_fields.sql

-- Drop AI Analysis relation table
DROP TABLE IF EXISTS ai.case_ai_analyses CASCADE;

-- Drop Decision table
DROP TABLE IF EXISTS medical.decisions CASCADE;

-- Drop indices for Case model added fields
DROP INDEX IF EXISTS medical.idx_cases_request_date;
DROP INDEX IF EXISTS medical.idx_cases_value;
DROP INDEX IF EXISTS medical.idx_cases_procedure_code;

-- Remove added fields from Case model
ALTER TABLE medical.cases 
DROP COLUMN IF EXISTS request_date,
DROP COLUMN IF EXISTS value,
DROP COLUMN IF EXISTS procedure_description,
DROP COLUMN IF EXISTS procedure_code;

-- Drop the update trigger function
DROP TRIGGER IF EXISTS update_decisions_updated_at ON medical.decisions;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Note: This rollback will restore the schema to its previous state
-- However, any data in the new fields will be lost
-- Run data migration scripts before executing this rollback if data preservation is needed