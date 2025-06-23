-- SQL migration to add workflow models to the database
-- This script should be executed after the Prisma schema is updated

-- Create workflow_definitions table
CREATE TABLE IF NOT EXISTS medical.workflow_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  configuration JSONB DEFAULT '{}',
  variables JSONB DEFAULT '[]',
  steps JSONB DEFAULT '[]',
  integrations JSONB DEFAULT '[]',
  compliance JSONB DEFAULT '[]',
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, version)
);

-- Create workflow_instances table
CREATE TABLE IF NOT EXISTS medical.workflow_instances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  definition_id UUID NOT NULL REFERENCES medical.workflow_definitions(id),
  definition_version VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL,
  current_step VARCHAR(255),
  priority VARCHAR(20) NOT NULL,
  variables JSONB DEFAULT '{}',
  input_data JSONB DEFAULT '{}',
  output_data JSONB,
  assigned_to UUID,
  version INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create workflow_events table
CREATE TABLE IF NOT EXISTS medical.workflow_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES medical.workflow_instances(id),
  step_execution_id UUID,
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB DEFAULT '{}',
  source VARCHAR(100) NOT NULL,
  user_id UUID,
  correlation_id VARCHAR(255) NOT NULL,
  causation_id VARCHAR(255),
  trace_id VARCHAR(255) NOT NULL,
  version INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create workflow_step_executions table
CREATE TABLE IF NOT EXISTS medical.workflow_step_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES medical.workflow_instances(id),
  step_id VARCHAR(255) NOT NULL,
  step_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  attempt INTEGER DEFAULT 1,
  input_data JSONB DEFAULT '{}',
  output_data JSONB,
  error JSONB,
  assigned_to UUID,
  assigned_at TIMESTAMPTZ,
  completed_by VARCHAR(255),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create workflow_snapshots table
CREATE TABLE IF NOT EXISTS medical.workflow_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID UNIQUE NOT NULL REFERENCES medical.workflow_instances(id),
  version INTEGER NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create workflow_metrics table
CREATE TABLE IF NOT EXISTS analytics.workflow_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL,
  metric_name VARCHAR(255) NOT NULL,
  metric_value DECIMAL(20, 4) NOT NULL,
  dimensions JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key reference to workflow_events for step_execution_id
ALTER TABLE medical.workflow_events 
  ADD CONSTRAINT fk_workflow_events_step_execution 
  FOREIGN KEY (step_execution_id) 
  REFERENCES medical.workflow_step_executions(id);

-- Create indexes for better performance
CREATE INDEX idx_workflow_instances_entity ON medical.workflow_instances(entity_type, entity_id);
CREATE INDEX idx_workflow_instances_status ON medical.workflow_instances(status);
CREATE INDEX idx_workflow_instances_assigned ON medical.workflow_instances(assigned_to);

CREATE INDEX idx_workflow_events_workflow ON medical.workflow_events(workflow_id);
CREATE INDEX idx_workflow_events_type ON medical.workflow_events(event_type);
CREATE INDEX idx_workflow_events_timestamp ON medical.workflow_events(timestamp);

CREATE INDEX idx_workflow_step_executions_workflow ON medical.workflow_step_executions(workflow_id);
CREATE INDEX idx_workflow_step_executions_status ON medical.workflow_step_executions(status);

CREATE INDEX idx_workflow_metrics_workflow ON analytics.workflow_metrics(workflow_id);
CREATE INDEX idx_workflow_metrics_name ON analytics.workflow_metrics(metric_name);
CREATE INDEX idx_workflow_metrics_timestamp ON analytics.workflow_metrics(timestamp);