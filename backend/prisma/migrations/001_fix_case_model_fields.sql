-- Migration: Fix Case model missing fields and relations
-- Date: 2025-06-22
-- Description: Add missing fields to Case model and create Decision relation

-- Add missing fields to Case model
ALTER TABLE medical.cases 
ADD COLUMN IF NOT EXISTS procedure_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS procedure_description TEXT,
ADD COLUMN IF NOT EXISTS value DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS request_date TIMESTAMPTZ(6);

-- Update existing records with default values
UPDATE medical.cases 
SET 
  procedure_code = COALESCE(metadata->>'procedureCode', 'UNKNOWN'),
  procedure_description = COALESCE(metadata->>'procedureDescription', description),
  value = COALESCE((metadata->>'value')::decimal, 0.00),
  request_date = COALESCE(created_at, NOW())
WHERE procedure_code IS NULL;

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_cases_procedure_code ON medical.cases(procedure_code);
CREATE INDEX IF NOT EXISTS idx_cases_value ON medical.cases(value);
CREATE INDEX IF NOT EXISTS idx_cases_request_date ON medical.cases(request_date);

-- Create Decision model (if it doesn't exist)
CREATE TABLE IF NOT EXISTS medical.decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES medical.cases(id) ON DELETE CASCADE,
  decision_type VARCHAR(50) NOT NULL,
  decision VARCHAR(50) NOT NULL,
  reviewer_id UUID REFERENCES auth.users(id),
  rationale TEXT NOT NULL,
  conditions_applied JSONB DEFAULT '[]',
  valid_from TIMESTAMPTZ(6) NOT NULL,
  valid_until TIMESTAMPTZ(6) NOT NULL,
  appeal_deadline TIMESTAMPTZ(6),
  decided_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- Create indices for Decision model
CREATE INDEX IF NOT EXISTS idx_decisions_case_id ON medical.decisions(case_id);
CREATE INDEX IF NOT EXISTS idx_decisions_reviewer_id ON medical.decisions(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_decisions_decision_type ON medical.decisions(decision_type);

-- Create AI Analysis relation table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS ai.case_ai_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES medical.cases(id) ON DELETE CASCADE,
  analysis_result_id UUID NOT NULL REFERENCES ai.analysis_results(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE(case_id, analysis_result_id)
);

-- Create indices for AI Analysis relation
CREATE INDEX IF NOT EXISTS idx_case_ai_analyses_case_id ON ai.case_ai_analyses(case_id);
CREATE INDEX IF NOT EXISTS idx_case_ai_analyses_analysis_result_id ON ai.case_ai_analyses(analysis_result_id);

-- Add updated_at trigger for decisions table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_decisions_updated_at ON medical.decisions;
CREATE TRIGGER update_decisions_updated_at 
  BEFORE UPDATE ON medical.decisions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();