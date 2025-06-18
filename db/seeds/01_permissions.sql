-- Seed data for permissions
-- This file sets up the initial permission structure for AUSTA Cockpit

BEGIN;

-- Clear existing permissions
TRUNCATE TABLE auth.role_permissions CASCADE;
TRUNCATE TABLE auth.permissions CASCADE;

-- Insert base permissions
INSERT INTO auth.permissions (resource, action, description) VALUES
-- User management
('users', 'create', 'Create new users'),
('users', 'read', 'View user information'),
('users', 'update', 'Update user information'),
('users', 'delete', 'Delete users'),
('users', 'suspend', 'Suspend user accounts'),

-- Organization management
('organizations', 'create', 'Create new organizations'),
('organizations', 'read', 'View organization information'),
('organizations', 'update', 'Update organization information'),
('organizations', 'delete', 'Delete organizations'),

-- Authorization management
('authorizations', 'create', 'Create authorization requests'),
('authorizations', 'read', 'View authorization requests'),
('authorizations', 'update', 'Update authorization requests'),
('authorizations', 'approve', 'Approve authorization requests'),
('authorizations', 'deny', 'Deny authorization requests'),
('authorizations', 'appeal', 'Handle authorization appeals'),

-- Claim management
('claims', 'create', 'Submit claims'),
('claims', 'read', 'View claims'),
('claims', 'update', 'Update claims'),
('claims', 'process', 'Process claims'),
('claims', 'approve', 'Approve claims'),
('claims', 'deny', 'Deny claims'),

-- AI/Analytics
('ai_models', 'manage', 'Manage AI models'),
('analytics', 'view', 'View analytics dashboards'),
('analytics', 'export', 'Export analytics data'),

-- Audit and compliance
('audit_logs', 'read', 'View audit logs'),
('compliance', 'manage', 'Manage compliance violations'),
('fraud', 'investigate', 'Investigate fraud cases'),

-- System administration
('system', 'configure', 'Configure system settings'),
('system', 'backup', 'Perform system backups'),
('system', 'monitor', 'Monitor system health');

-- Assign permissions to roles
-- Admin role - full access
INSERT INTO auth.role_permissions (role, permission_id)
SELECT 'admin', id FROM auth.permissions;

-- Doctor role
INSERT INTO auth.role_permissions (role, permission_id)
SELECT 'doctor', id FROM auth.permissions 
WHERE (resource = 'authorizations' AND action IN ('create', 'read', 'update'))
   OR (resource = 'claims' AND action IN ('create', 'read'))
   OR (resource = 'users' AND action = 'read')
   OR (resource = 'organizations' AND action = 'read')
   OR (resource = 'analytics' AND action = 'view');

-- Nurse role
INSERT INTO auth.role_permissions (role, permission_id)
SELECT 'nurse', id FROM auth.permissions 
WHERE (resource = 'authorizations' AND action IN ('create', 'read'))
   OR (resource = 'claims' AND action IN ('create', 'read'))
   OR (resource = 'users' AND action = 'read')
   OR (resource = 'organizations' AND action = 'read');

-- Auditor role
INSERT INTO auth.role_permissions (role, permission_id)
SELECT 'auditor', id FROM auth.permissions 
WHERE (resource IN ('authorizations', 'claims') AND action = 'read')
   OR (resource = 'audit_logs' AND action = 'read')
   OR (resource = 'compliance' AND action = 'manage')
   OR (resource = 'fraud' AND action = 'investigate')
   OR (resource = 'analytics' AND action IN ('view', 'export'));

-- Analyst role
INSERT INTO auth.role_permissions (role, permission_id)
SELECT 'analyst', id FROM auth.permissions 
WHERE (resource = 'analytics' AND action IN ('view', 'export'))
   OR (resource IN ('authorizations', 'claims') AND action = 'read')
   OR (resource = 'ai_models' AND action = 'manage');

-- Reviewer role
INSERT INTO auth.role_permissions (role, permission_id)
SELECT 'reviewer', id FROM auth.permissions 
WHERE (resource = 'authorizations' AND action IN ('read', 'approve', 'deny', 'appeal'))
   OR (resource = 'claims' AND action IN ('read', 'process', 'approve', 'deny'))
   OR (resource = 'analytics' AND action = 'view');

COMMIT;