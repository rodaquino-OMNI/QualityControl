-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ai";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "analytics";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "medical";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "auth"."organization_type" AS ENUM ('provider', 'insurer', 'administrator', 'auditor');

-- CreateEnum
CREATE TYPE "auth"."organization_status" AS ENUM ('active', 'suspended', 'inactive');

-- CreateEnum
CREATE TYPE "auth"."user_status" AS ENUM ('active', 'suspended', 'inactive', 'pending');

-- CreateEnum
CREATE TYPE "medical"."risk_category" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "medical"."risk_level" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "medical"."urgency_level" AS ENUM ('routine', 'urgent', 'emergency');

-- CreateEnum
CREATE TYPE "medical"."authorization_status" AS ENUM ('pending', 'in_review', 'approved', 'denied', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "medical"."decision_type" AS ENUM ('automatic', 'manual', 'ai_assisted');

-- CreateEnum
CREATE TYPE "medical"."decision" AS ENUM ('approved', 'denied', 'partial', 'deferred');

-- CreateEnum
CREATE TYPE "medical"."claim_status" AS ENUM ('submitted', 'processing', 'approved', 'denied', 'appealed', 'paid');

-- CreateEnum
CREATE TYPE "ai"."ai_model_type" AS ENUM ('authorization', 'fraud_detection', 'risk_assessment', 'pattern_analysis');

-- CreateEnum
CREATE TYPE "ai"."ai_model_status" AS ENUM ('active', 'training', 'deprecated', 'inactive');

-- CreateEnum
CREATE TYPE "ai"."entity_type" AS ENUM ('authorization', 'claim', 'provider', 'patient');

-- CreateEnum
CREATE TYPE "audit"."violation_severity" AS ENUM ('low', 'medium', 'high', 'critical', 'minor', 'moderate', 'major');

-- CreateEnum
CREATE TYPE "ai"."fraud_status" AS ENUM ('pending', 'investigating', 'confirmed', 'dismissed');

-- CreateEnum
CREATE TYPE "audit"."decision_maker_type" AS ENUM ('human', 'ai', 'system');

-- CreateEnum
CREATE TYPE "audit"."detection_method" AS ENUM ('system', 'ai', 'manual');

-- CreateEnum
CREATE TYPE "audit"."violation_status" AS ENUM ('open', 'investigating', 'resolved', 'escalated');

-- CreateEnum
CREATE TYPE "medical"."case_priority" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "medical"."case_status" AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "auth"."notification_type" AS ENUM ('info', 'warning', 'error', 'success', 'case_update', 'system_alert');

-- CreateEnum
CREATE TYPE "auth"."notification_priority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateTable
CREATE TABLE "auth"."organizations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "type" "auth"."organization_type" NOT NULL,
    "tax_id" VARCHAR(50),
    "status" "auth"."organization_status" NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(255),
    "last_name" VARCHAR(255),
    "username" VARCHAR(100),
    "avatar" VARCHAR(500),
    "role" VARCHAR(50) NOT NULL,
    "license_number" VARCHAR(100),
    "specialization" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."permissions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "resource" VARCHAR(100) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."roles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "auth"."role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "auth"."refresh_tokens" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."login_history" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."api_keys" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."oauth_accounts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_id" VARCHAR(255) NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical"."cases" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "patient_id" UUID,
    "patient_name" VARCHAR(255),
    "priority" "medical"."case_priority" NOT NULL DEFAULT 'medium',
    "status" "medical"."case_status" NOT NULL DEFAULT 'open',
    "assigned_to" UUID,
    "created_by" UUID NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical"."notes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "case_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "author" VARCHAR(255) NOT NULL,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical"."attachments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "case_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" VARCHAR(100) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical"."activities" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "type" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "user_id" UUID,
    "user" VARCHAR(255),
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."notifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "type" "auth"."notification_type" NOT NULL,
    "message" TEXT NOT NULL,
    "title" VARCHAR(255),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "priority" "auth"."notification_priority" NOT NULL DEFAULT 'medium',
    "entity_id" UUID,
    "entity_type" VARCHAR(50),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical"."patients" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "patient_code" VARCHAR(100) NOT NULL,
    "birth_year" INTEGER,
    "gender" VARCHAR(20),
    "insurance_type" VARCHAR(50),
    "risk_category" "medical"."risk_category",
    "chronic_conditions" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical"."procedures" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "subcategory" VARCHAR(100),
    "typical_duration_minutes" INTEGER,
    "requires_preauth" BOOLEAN NOT NULL DEFAULT false,
    "risk_level" "medical"."risk_level" NOT NULL DEFAULT 'low',
    "guidelines" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical"."authorization_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "request_number" VARCHAR(100) NOT NULL,
    "patient_id" UUID NOT NULL,
    "requesting_provider_id" UUID NOT NULL,
    "requesting_doctor_id" UUID NOT NULL,
    "procedure_id" UUID NOT NULL,
    "urgency_level" "medical"."urgency_level" NOT NULL,
    "clinical_justification" TEXT NOT NULL,
    "diagnosis_codes" JSONB NOT NULL DEFAULT '[]',
    "supporting_documents" JSONB NOT NULL DEFAULT '[]',
    "status" "medical"."authorization_status" NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authorization_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical"."authorization_decisions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "authorization_request_id" UUID NOT NULL,
    "decision_type" "medical"."decision_type" NOT NULL,
    "decision" "medical"."decision" NOT NULL,
    "reviewer_id" UUID,
    "decision_rationale" TEXT NOT NULL,
    "conditions_applied" JSONB NOT NULL DEFAULT '[]',
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "appeal_deadline" TIMESTAMPTZ(6),
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authorization_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical"."claims" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "claim_number" VARCHAR(100) NOT NULL,
    "authorization_id" UUID,
    "patient_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "procedure_id" UUID NOT NULL,
    "service_date" DATE NOT NULL,
    "billed_amount" DECIMAL(10,2) NOT NULL,
    "allowed_amount" DECIMAL(10,2),
    "paid_amount" DECIMAL(10,2),
    "status" "medical"."claim_status" NOT NULL DEFAULT 'submitted',
    "denial_reason" VARCHAR(255),
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."models" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "type" "ai"."ai_model_type" NOT NULL,
    "status" "ai"."ai_model_status" NOT NULL DEFAULT 'active',
    "accuracy_score" DECIMAL(5,2),
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "deployed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."analysis_results" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "model_id" UUID NOT NULL,
    "entity_type" "ai"."entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "analysis_type" VARCHAR(50) NOT NULL,
    "confidence_score" DECIMAL(5,2) NOT NULL,
    "risk_score" DECIMAL(5,2),
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "findings" JSONB NOT NULL DEFAULT '{}',
    "processing_time_ms" INTEGER,
    "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."ai_analysis" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "analysis_type" VARCHAR(100) NOT NULL,
    "result" JSONB NOT NULL,
    "confidence" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."ai_conversations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255),
    "context" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."ai_messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "conversation_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."fraud_indicators" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "severity" "audit"."violation_severity" NOT NULL,
    "detection_logic" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai"."fraud_detections" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "entity_type" "ai"."entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "indicator_id" UUID NOT NULL,
    "confidence_score" DECIMAL(5,2) NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" "ai"."fraud_status" NOT NULL DEFAULT 'pending',
    "investigator_id" UUID,
    "resolution_notes" TEXT,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."activity_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "organization_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "ip_address" INET,
    "user_agent" TEXT,
    "request_id" UUID,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."decision_trails" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "decision_id" UUID NOT NULL,
    "decision_type" VARCHAR(50) NOT NULL,
    "decision_maker_id" UUID,
    "decision_maker_type" "audit"."decision_maker_type",
    "factors_considered" JSONB NOT NULL,
    "rules_applied" JSONB NOT NULL DEFAULT '[]',
    "override_reason" TEXT,
    "compliance_checks" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_trails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."compliance_violations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "violation_type" VARCHAR(100) NOT NULL,
    "severity" "audit"."violation_severity" NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "regulatory_reference" VARCHAR(255),
    "detected_by" "audit"."detection_method",
    "status" "audit"."violation_status" NOT NULL DEFAULT 'open',
    "resolution_required_by" DATE,
    "resolution_notes" TEXT,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."performance_metrics" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "metric_type" VARCHAR(100) NOT NULL,
    "metric_name" VARCHAR(255) NOT NULL,
    "metric_value" DECIMAL(20,4) NOT NULL,
    "dimensions" JSONB NOT NULL DEFAULT '{}',
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."provider_metrics" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "provider_id" UUID NOT NULL,
    "metric_date" DATE NOT NULL,
    "total_authorizations" INTEGER NOT NULL DEFAULT 0,
    "approved_authorizations" INTEGER NOT NULL DEFAULT 0,
    "denied_authorizations" INTEGER NOT NULL DEFAULT 0,
    "approval_rate" DECIMAL(5,2),
    "average_processing_time_hours" DECIMAL(10,2),
    "fraud_incidents" INTEGER NOT NULL DEFAULT 0,
    "compliance_score" DECIMAL(5,2),
    "quality_score" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics"."user_activity_summary" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "activity_date" DATE NOT NULL,
    "total_decisions" INTEGER NOT NULL DEFAULT 0,
    "approvals" INTEGER NOT NULL DEFAULT 0,
    "denials" INTEGER NOT NULL DEFAULT 0,
    "average_decision_time_minutes" DECIMAL(10,2),
    "overrides" INTEGER NOT NULL DEFAULT 0,
    "ai_agreement_rate" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activity_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_tax_id_key" ON "auth"."organizations"("tax_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "auth"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "auth"."users"("username");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "auth"."users"("email");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "auth"."users"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "auth"."sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_token_hash_idx" ON "auth"."sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "auth"."sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "auth"."permissions"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "auth"."roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "auth"."refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "auth"."refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "login_history_user_id_idx" ON "auth"."login_history"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "auth"."api_keys"("key");

-- CreateIndex
CREATE INDEX "oauth_accounts_user_id_idx" ON "auth"."oauth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_id_key" ON "auth"."oauth_accounts"("provider", "provider_id");

-- CreateIndex
CREATE INDEX "cases_patient_id_idx" ON "medical"."cases"("patient_id");

-- CreateIndex
CREATE INDEX "cases_assigned_to_idx" ON "medical"."cases"("assigned_to");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "medical"."cases"("status");

-- CreateIndex
CREATE INDEX "cases_priority_idx" ON "medical"."cases"("priority");

-- CreateIndex
CREATE INDEX "notes_case_id_idx" ON "medical"."notes"("case_id");

-- CreateIndex
CREATE INDEX "notes_author_id_idx" ON "medical"."notes"("author_id");

-- CreateIndex
CREATE INDEX "attachments_case_id_idx" ON "medical"."attachments"("case_id");

-- CreateIndex
CREATE INDEX "attachments_uploaded_by_idx" ON "medical"."attachments"("uploaded_by");

-- CreateIndex
CREATE INDEX "activities_entity_id_entity_type_idx" ON "medical"."activities"("entity_id", "entity_type");

-- CreateIndex
CREATE INDEX "activities_user_id_idx" ON "medical"."activities"("user_id");

-- CreateIndex
CREATE INDEX "activities_timestamp_idx" ON "medical"."activities"("timestamp");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "auth"."notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_is_read_idx" ON "auth"."notifications"("is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "auth"."notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "patients_patient_code_key" ON "medical"."patients"("patient_code");

-- CreateIndex
CREATE UNIQUE INDEX "procedures_code_key" ON "medical"."procedures"("code");

-- CreateIndex
CREATE UNIQUE INDEX "authorization_requests_request_number_key" ON "medical"."authorization_requests"("request_number");

-- CreateIndex
CREATE INDEX "authorization_requests_patient_id_idx" ON "medical"."authorization_requests"("patient_id");

-- CreateIndex
CREATE INDEX "authorization_requests_requesting_provider_id_idx" ON "medical"."authorization_requests"("requesting_provider_id");

-- CreateIndex
CREATE INDEX "authorization_requests_status_idx" ON "medical"."authorization_requests"("status");

-- CreateIndex
CREATE INDEX "authorization_requests_submitted_at_idx" ON "medical"."authorization_requests"("submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "claims_claim_number_key" ON "medical"."claims"("claim_number");

-- CreateIndex
CREATE INDEX "claims_authorization_id_idx" ON "medical"."claims"("authorization_id");

-- CreateIndex
CREATE INDEX "claims_status_idx" ON "medical"."claims"("status");

-- CreateIndex
CREATE UNIQUE INDEX "models_name_version_key" ON "ai"."models"("name", "version");

-- CreateIndex
CREATE INDEX "analysis_results_entity_type_entity_id_idx" ON "ai"."analysis_results"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ai_analysis_entity_type_entity_id_idx" ON "ai"."ai_analysis"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_idx" ON "ai"."ai_messages"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "fraud_indicators_name_key" ON "ai"."fraud_indicators"("name");

-- CreateIndex
CREATE INDEX "fraud_detections_entity_type_entity_id_idx" ON "ai"."fraud_detections"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "fraud_detections_status_idx" ON "ai"."fraud_detections"("status");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_idx" ON "audit"."activity_logs"("user_id");

-- CreateIndex
CREATE INDEX "activity_logs_entity_type_entity_id_idx" ON "audit"."activity_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "audit"."activity_logs"("created_at");

-- CreateIndex
CREATE INDEX "performance_metrics_metric_type_period_start_period_end_idx" ON "analytics"."performance_metrics"("metric_type", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "provider_metrics_provider_id_metric_date_idx" ON "analytics"."provider_metrics"("provider_id", "metric_date");

-- CreateIndex
CREATE UNIQUE INDEX "provider_metrics_provider_id_metric_date_key" ON "analytics"."provider_metrics"("provider_id", "metric_date");

-- CreateIndex
CREATE UNIQUE INDEX "user_activity_summary_user_id_activity_date_key" ON "analytics"."user_activity_summary"("user_id", "activity_date");

-- AddForeignKey
ALTER TABLE "auth"."users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "auth"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "auth"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "auth"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."login_history" ADD CONSTRAINT "login_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."cases" ADD CONSTRAINT "cases_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "medical"."patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."cases" ADD CONSTRAINT "cases_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."cases" ADD CONSTRAINT "cases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."notes" ADD CONSTRAINT "notes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "medical"."cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."notes" ADD CONSTRAINT "notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."attachments" ADD CONSTRAINT "attachments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "medical"."cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."attachments" ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."activities" ADD CONSTRAINT "activities_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "medical"."cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."authorization_requests" ADD CONSTRAINT "authorization_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "medical"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."authorization_requests" ADD CONSTRAINT "authorization_requests_requesting_provider_id_fkey" FOREIGN KEY ("requesting_provider_id") REFERENCES "auth"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."authorization_requests" ADD CONSTRAINT "authorization_requests_requesting_doctor_id_fkey" FOREIGN KEY ("requesting_doctor_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."authorization_requests" ADD CONSTRAINT "authorization_requests_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "medical"."procedures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."authorization_decisions" ADD CONSTRAINT "authorization_decisions_authorization_request_id_fkey" FOREIGN KEY ("authorization_request_id") REFERENCES "medical"."authorization_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."authorization_decisions" ADD CONSTRAINT "authorization_decisions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."claims" ADD CONSTRAINT "claims_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "medical"."authorization_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."claims" ADD CONSTRAINT "claims_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "medical"."patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."claims" ADD CONSTRAINT "claims_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "auth"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical"."claims" ADD CONSTRAINT "claims_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "medical"."procedures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai"."analysis_results" ADD CONSTRAINT "analysis_results_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai"."models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai"."ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai"."ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai"."fraud_detections" ADD CONSTRAINT "fraud_detections_indicator_id_fkey" FOREIGN KEY ("indicator_id") REFERENCES "ai"."fraud_indicators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai"."fraud_detections" ADD CONSTRAINT "fraud_detections_investigator_id_fkey" FOREIGN KEY ("investigator_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit"."activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit"."activity_logs" ADD CONSTRAINT "activity_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit"."decision_trails" ADD CONSTRAINT "decision_trails_decision_maker_id_fkey" FOREIGN KEY ("decision_maker_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics"."provider_metrics" ADD CONSTRAINT "provider_metrics_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "auth"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics"."user_activity_summary" ADD CONSTRAINT "user_activity_summary_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

