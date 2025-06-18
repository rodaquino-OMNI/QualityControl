-- Seed data for fraud indicators
-- Common healthcare fraud patterns for AUSTA Cockpit

BEGIN;

-- Clear existing indicators
TRUNCATE TABLE ai.fraud_indicators CASCADE;

-- Insert fraud indicators
INSERT INTO ai.fraud_indicators (name, category, severity, detection_logic, active) VALUES
-- Provider-based fraud indicators
('Excessive Billing Pattern', 'provider_billing', 'high', 
 '{"type": "threshold", "conditions": {"daily_claims": {"operator": ">", "value": 50}, "monthly_amount": {"operator": ">", "value": 500000}}}', 
 true),

('Unusual Service Frequency', 'provider_billing', 'medium',
 '{"type": "pattern", "conditions": {"same_patient_same_day": {"operator": ">", "value": 3}, "service_type": "identical"}}',
 true),

('After-Hours Billing Spike', 'provider_billing', 'medium',
 '{"type": "temporal", "conditions": {"time_range": "22:00-06:00", "volume_increase": {"operator": ">", "value": 300}}}',
 true),

-- Patient-based fraud indicators
('Doctor Shopping', 'patient_behavior', 'high',
 '{"type": "pattern", "conditions": {"unique_providers_30days": {"operator": ">", "value": 5}, "same_medication": true}}',
 true),

('Impossible Travel Pattern', 'patient_behavior', 'critical',
 '{"type": "geographic", "conditions": {"locations_same_day": {"operator": ">", "value": 2}, "distance_km": {"operator": ">", "value": 500}}}',
 true),

-- Procedure-based fraud indicators
('Upcoding Detection', 'coding_fraud', 'high',
 '{"type": "statistical", "conditions": {"high_complexity_ratio": {"operator": ">", "value": 0.8}, "peer_comparison": {"operator": ">", "value": 2}}}',
 true),

('Unbundling Services', 'coding_fraud', 'medium',
 '{"type": "pattern", "conditions": {"bundled_procedures_separate": true, "same_date": true}}',
 true),

('Phantom Billing', 'service_fraud', 'critical',
 '{"type": "verification", "conditions": {"no_supporting_documentation": true, "high_value_procedure": true}}',
 true),

-- Authorization fraud indicators
('Repeated Denial Override', 'authorization_fraud', 'medium',
 '{"type": "pattern", "conditions": {"denial_overrides_30days": {"operator": ">", "value": 10}, "same_provider": true}}',
 true),

('Rush Authorization Pattern', 'authorization_fraud', 'low',
 '{"type": "temporal", "conditions": {"emergency_ratio": {"operator": ">", "value": 0.5}, "non_emergency_procedures": true}}',
 true),

-- Identity fraud indicators
('Identity Verification Failure', 'identity_fraud', 'critical',
 '{"type": "verification", "conditions": {"id_mismatch": true, "high_value_claim": true}}',
 true),

('Deceased Patient Activity', 'identity_fraud', 'critical',
 '{"type": "cross_reference", "conditions": {"death_registry_match": true, "activity_after_death": true}}',
 true),

-- Network fraud indicators
('Kickback Suspicion', 'network_fraud', 'high',
 '{"type": "relationship", "conditions": {"referral_concentration": {"operator": ">", "value": 0.9}, "reciprocal_referrals": true}}',
 true),

('Collusion Pattern', 'network_fraud', 'high',
 '{"type": "network_analysis", "conditions": {"closed_referral_loop": true, "unusual_success_rate": {"operator": ">", "value": 0.95}}}',
 true),

-- Equipment/Supply fraud
('DME Oversupply', 'equipment_fraud', 'medium',
 '{"type": "volume", "conditions": {"dme_per_patient": {"operator": ">", "value": 5}, "timeframe_days": 30}}',
 true),

('Impossible Equipment Combination', 'equipment_fraud', 'high',
 '{"type": "logic", "conditions": {"conflicting_equipment": true, "same_patient": true}}',
 true);

COMMIT;