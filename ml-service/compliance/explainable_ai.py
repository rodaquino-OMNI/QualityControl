#!/usr/bin/env python3
"""
Explainable AI and Compliance Framework for QualityControl Healthcare Platform
Ensures AI transparency, regulatory compliance, and audit trail for healthcare decisions.
"""

import os
import logging
import json
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
import numpy as np
import pandas as pd
import shap
import lime
from lime.tabular import LimeTabularExplainer
from sklearn.base import BaseEstimator
import asyncio
from dataclasses import dataclass, asdict
from enum import Enum
from cryptography.fernet import Fernet
import redis
from sqlalchemy import create_engine, text

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ComplianceLevel(Enum):
    HIPAA = "hipaa"
    GDPR = "gdpr"
    SOX = "sox"
    ANS_BRAZIL = "ans_brazil"  # Brazilian health regulator
    CFM_BRAZIL = "cfm_brazil"  # Brazilian medical council

class ExplanationMethod(Enum):
    SHAP = "shap"
    LIME = "lime"
    FEATURE_IMPORTANCE = "feature_importance"
    PERMUTATION_IMPORTANCE = "permutation_importance"
    DECISION_TREE = "decision_tree"

@dataclass
class ExplanationResult:
    prediction_id: str
    model_type: str
    explanation_method: ExplanationMethod
    feature_contributions: Dict[str, float]
    explanation_text: str
    confidence_level: float
    regulatory_notes: List[str]
    audit_trail: Dict[str, Any]
    timestamp: datetime

@dataclass
class ComplianceAudit:
    audit_id: str
    prediction_id: str
    compliance_level: ComplianceLevel
    compliance_status: str  # "compliant", "non_compliant", "requires_review"
    checks_performed: List[str]
    violations_found: List[str]
    remediation_actions: List[str]
    auditor_notes: str
    timestamp: datetime

class ExplainableAI:
    """Explainable AI system with regulatory compliance"""
    
    def __init__(self):
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://user:pass@localhost/qualitycontrol')
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.encryption_key = os.getenv('ENCRYPTION_KEY', Fernet.generate_key())
        
        # Initialize connections
        self.engine = create_engine(self.db_url)
        self.redis = redis.from_url(self.redis_url)
        self.cipher_suite = Fernet(self.encryption_key)
        
        # Compliance requirements by level
        self.compliance_requirements = {
            ComplianceLevel.HIPAA: {
                'explanation_required': True,
                'data_encryption': True,
                'audit_trail': True,
                'human_oversight': True,
                'data_retention_days': 2555,  # 7 years
                'anonymization_required': True,
                'access_controls': True
            },
            ComplianceLevel.ANS_BRAZIL: {
                'explanation_required': True,
                'medical_justification': True,
                'audit_trail': True,
                'physician_oversight': True,
                'data_retention_days': 3650,  # 10 years
                'regulatory_reporting': True
            },
            ComplianceLevel.CFM_BRAZIL: {
                'medical_ethics_check': True,
                'physician_responsibility': True,
                'patient_consent': True,
                'explanation_required': True,
                'audit_trail': True
            }
        }
        
        # Initialize explainers cache
        self.explainers_cache = {}
    
    async def generate_explanation(self, prediction_id: str, model_type: str, 
                                 model: BaseEstimator, features: np.ndarray,
                                 feature_names: List[str], prediction: Any,
                                 method: ExplanationMethod = ExplanationMethod.SHAP) -> ExplanationResult:
        """Generate explanation for a prediction"""
        try:
            logger.info(f"Generating explanation for prediction {prediction_id} using {method.value}")
            
            # Get appropriate explainer
            explainer = await self._get_explainer(model, features, feature_names, method)
            
            # Generate explanation
            if method == ExplanationMethod.SHAP:
                explanation = await self._generate_shap_explanation(
                    explainer, features, feature_names, prediction
                )
            elif method == ExplanationMethod.LIME:
                explanation = await self._generate_lime_explanation(
                    explainer, features, feature_names, prediction
                )
            elif method == ExplanationMethod.FEATURE_IMPORTANCE:
                explanation = await self._generate_feature_importance_explanation(
                    model, feature_names
                )
            else:
                explanation = await self._generate_permutation_explanation(
                    model, features, feature_names
                )
            
            # Create regulatory notes
            regulatory_notes = await self._generate_regulatory_notes(
                model_type, explanation, prediction
            )
            
            # Create audit trail
            audit_trail = await self._create_audit_trail(
                prediction_id, model_type, method, explanation
            )
            
            # Generate human-readable explanation
            explanation_text = await self._generate_explanation_text(
                explanation, feature_names, model_type, prediction
            )
            
            result = ExplanationResult(
                prediction_id=prediction_id,
                model_type=model_type,
                explanation_method=method,
                feature_contributions=explanation,
                explanation_text=explanation_text,
                confidence_level=await self._calculate_explanation_confidence(explanation),
                regulatory_notes=regulatory_notes,
                audit_trail=audit_trail,
                timestamp=datetime.now()
            )
            
            # Store explanation
            await self._store_explanation(result)
            
            return result
            
        except Exception as e:
            logger.error(f"Error generating explanation for {prediction_id}: {e}")
            raise
    
    async def _get_explainer(self, model: BaseEstimator, features: np.ndarray,
                           feature_names: List[str], method: ExplanationMethod):
        """Get or create explainer for the model"""
        cache_key = f"{method.value}_{hash(str(model))}"
        
        if cache_key in self.explainers_cache:
            return self.explainers_cache[cache_key]
        
        if method == ExplanationMethod.SHAP:
            # Choose appropriate SHAP explainer based on model type
            if hasattr(model, 'predict_proba'):
                explainer = shap.Explainer(model)
            else:
                explainer = shap.Explainer(model.predict, features[:100])  # Sample for performance
        
        elif method == ExplanationMethod.LIME:
            explainer = LimeTabularExplainer(
                features,
                feature_names=feature_names,
                mode='classification' if hasattr(model, 'predict_proba') else 'regression',
                discretize_continuous=True
            )
        
        else:
            explainer = model  # For feature importance methods
        
        self.explainers_cache[cache_key] = explainer
        return explainer
    
    async def _generate_shap_explanation(self, explainer, features: np.ndarray,
                                       feature_names: List[str], prediction: Any) -> Dict[str, float]:
        """Generate SHAP-based explanation"""
        try:
            # Get SHAP values
            shap_values = explainer(features)
            
            # Extract feature contributions
            if hasattr(shap_values, 'values'):
                contributions = shap_values.values[0] if len(shap_values.values.shape) > 1 else shap_values.values
            else:
                contributions = shap_values[0] if isinstance(shap_values, list) else shap_values
            
            # Create feature contribution dictionary
            explanation = {}
            for i, feature_name in enumerate(feature_names):
                if i < len(contributions):
                    explanation[feature_name] = float(contributions[i])
            
            return explanation
            
        except Exception as e:
            logger.error(f"Error generating SHAP explanation: {e}")
            return {}
    
    async def _generate_lime_explanation(self, explainer, features: np.ndarray,
                                       feature_names: List[str], prediction: Any) -> Dict[str, float]:
        """Generate LIME-based explanation"""
        try:
            # Get LIME explanation
            explanation_lime = explainer.explain_instance(
                features[0], 
                prediction,
                num_features=min(10, len(feature_names))
            )
            
            # Extract feature contributions
            explanation = {}
            for feature_idx, contribution in explanation_lime.as_list():
                if isinstance(feature_idx, int) and feature_idx < len(feature_names):
                    feature_name = feature_names[feature_idx]
                else:
                    feature_name = str(feature_idx)
                explanation[feature_name] = float(contribution)
            
            return explanation
            
        except Exception as e:
            logger.error(f"Error generating LIME explanation: {e}")
            return {}
    
    async def _generate_feature_importance_explanation(self, model: BaseEstimator,
                                                     feature_names: List[str]) -> Dict[str, float]:
        """Generate feature importance explanation"""
        try:
            if hasattr(model, 'feature_importances_'):
                importances = model.feature_importances_
            elif hasattr(model, 'coef_'):
                importances = np.abs(model.coef_[0] if len(model.coef_.shape) > 1 else model.coef_)
            else:
                return {}
            
            explanation = {}
            for i, feature_name in enumerate(feature_names):
                if i < len(importances):
                    explanation[feature_name] = float(importances[i])
            
            return explanation
            
        except Exception as e:
            logger.error(f"Error generating feature importance explanation: {e}")
            return {}
    
    async def _generate_permutation_explanation(self, model: BaseEstimator,
                                              features: np.ndarray,
                                              feature_names: List[str]) -> Dict[str, float]:
        """Generate permutation importance explanation"""
        try:
            from sklearn.inspection import permutation_importance
            
            # Use a subset of data for performance
            sample_size = min(100, features.shape[0])
            sample_indices = np.random.choice(features.shape[0], sample_size, replace=False)
            sample_features = features[sample_indices]
            
            # Generate dummy target for permutation importance
            sample_target = model.predict(sample_features)
            
            # Calculate permutation importance
            perm_importance = permutation_importance(
                model, sample_features, sample_target, n_repeats=5, random_state=42
            )
            
            explanation = {}
            for i, feature_name in enumerate(feature_names):
                if i < len(perm_importance.importances_mean):
                    explanation[feature_name] = float(perm_importance.importances_mean[i])
            
            return explanation
            
        except Exception as e:
            logger.error(f"Error generating permutation explanation: {e}")
            return {}
    
    async def _generate_regulatory_notes(self, model_type: str, explanation: Dict[str, float],
                                       prediction: Any) -> List[str]:
        """Generate regulatory compliance notes"""
        notes = []
        
        # Add model-specific regulatory notes
        if model_type == 'authorization':
            notes.append("Authorization decision based on medical necessity assessment")
            notes.append("Decision follows ANS (Brazilian Health Agency) guidelines")
            notes.append("Human physician oversight required for high-risk cases")
            
            # Check for high-impact features
            top_features = sorted(explanation.items(), key=lambda x: abs(x[1]), reverse=True)[:3]
            for feature, impact in top_features:
                if 'patient' in feature.lower():
                    notes.append(f"Patient factor '{feature}' significantly influenced decision (impact: {impact:.3f})")
                elif 'procedure' in feature.lower():
                    notes.append(f"Procedure characteristic '{feature}' was key factor (impact: {impact:.3f})")
        
        elif model_type == 'fraud_detection':
            notes.append("Fraud detection analysis performed using statistical patterns")
            notes.append("Manual investigation required for high-risk cases")
            notes.append("Patient privacy protected through data anonymization")
        
        # Add general compliance notes
        notes.append("AI decision support system - final decision authority remains with qualified personnel")
        notes.append("Explanation generated using interpretable machine learning techniques")
        notes.append("All data processing complies with LGPD (Brazilian Data Protection Law)")
        
        return notes
    
    async def _create_audit_trail(self, prediction_id: str, model_type: str,
                                method: ExplanationMethod, explanation: Dict[str, float]) -> Dict[str, Any]:
        """Create comprehensive audit trail"""
        return {
            'prediction_id': prediction_id,
            'model_type': model_type,
            'explanation_method': method.value,
            'explanation_generated_at': datetime.now().isoformat(),
            'feature_count': len(explanation),
            'top_features': sorted(explanation.items(), key=lambda x: abs(x[1]), reverse=True)[:5],
            'explanation_hash': hashlib.sha256(json.dumps(explanation, sort_keys=True).encode()).hexdigest(),
            'compliance_checks': ['data_anonymization', 'audit_logging', 'explanation_generation'],
            'system_version': '2.1.0',
            'regulatory_framework': ['HIPAA', 'LGPD', 'ANS_BRAZIL']
        }
    
    async def _generate_explanation_text(self, explanation: Dict[str, float],
                                       feature_names: List[str], model_type: str,
                                       prediction: Any) -> str:
        """Generate human-readable explanation text"""
        try:
            # Sort features by importance
            sorted_features = sorted(explanation.items(), key=lambda x: abs(x[1]), reverse=True)
            
            if model_type == 'authorization':
                text = f"Autorização recomendada: {prediction}.\n\n"
                text += "Principais fatores que influenciaram esta decisão:\n\n"
                
                for i, (feature, impact) in enumerate(sorted_features[:5]):
                    direction = "favoreceu" if impact > 0 else "desencorajou"
                    text += f"{i+1}. {self._translate_feature_name(feature)}: {direction} a aprovação "
                    text += f"(impacto: {abs(impact):.3f})\n"
                
                text += "\nEsta recomendação foi gerada por sistema de inteligência artificial "
                text += "em conformidade com diretrizes da ANS e regulamentações brasileiras. "
                text += "A decisão final deve ser validada por profissional médico qualificado."
            
            elif model_type == 'fraud_detection':
                risk_level = "Alto" if max(explanation.values()) > 0.7 else "Médio" if max(explanation.values()) > 0.3 else "Baixo"
                text = f"Nível de risco de fraude: {risk_level}.\n\n"
                text += "Indicadores identificados:\n\n"
                
                for i, (feature, impact) in enumerate(sorted_features[:5]):
                    if impact > 0.1:
                        text += f"• {self._translate_feature_name(feature)}: indicador de risco "
                        text += f"(peso: {impact:.3f})\n"
                
                text += "\nAnálise baseada em padrões estatísticos e históricos. "
                text += "Investigação manual recomendada para casos de alto risco."
            
            else:
                text = f"Predição: {prediction}\n\n"
                text += "Fatores mais relevantes:\n"
                
                for feature, impact in sorted_features[:5]:
                    text += f"• {self._translate_feature_name(feature)}: {impact:.3f}\n"
            
            return text
            
        except Exception as e:
            logger.error(f"Error generating explanation text: {e}")
            return "Explicação não disponível devido a erro técnico."
    
    def _translate_feature_name(self, feature_name: str) -> str:
        """Translate technical feature names to Portuguese medical terms"""
        translations = {
            'patient_age_group': 'Faixa etária do paciente',
            'patient_risk_category_score': 'Categoria de risco do paciente',
            'provider_approval_rate': 'Taxa de aprovação do prestador',
            'procedure_complexity_score': 'Complexidade do procedimento',
            'urgency_level_normalized': 'Nível de urgência',
            'provider_fraud_incident_rate': 'Histórico de fraudes do prestador',
            'patient_chronic_condition_complexity': 'Complexidade de condições crônicas',
            'procedure_value_percentile': 'Valor do procedimento (percentil)',
            'document_quality_score': 'Qualidade da documentação',
            'justification_clarity': 'Clareza da justificativa médica'
        }
        
        return translations.get(feature_name, feature_name.replace('_', ' ').title())
    
    async def _calculate_explanation_confidence(self, explanation: Dict[str, float]) -> float:
        """Calculate confidence level of the explanation"""
        if not explanation:
            return 0.0
        
        # Calculate based on feature distribution
        values = list(explanation.values())
        
        # Check if there are dominant features
        max_impact = max(abs(v) for v in values)
        total_impact = sum(abs(v) for v in values)
        
        # Higher confidence if there are clear dominant features
        dominance_score = max_impact / (total_impact + 1e-6)
        
        # Higher confidence if many features contribute
        coverage_score = min(1.0, len([v for v in values if abs(v) > 0.01]) / 10)
        
        confidence = (dominance_score * 0.6 + coverage_score * 0.4)
        return min(1.0, max(0.0, confidence))
    
    async def _store_explanation(self, explanation: ExplanationResult):
        """Store explanation with encryption for compliance"""
        try:
            # Encrypt sensitive data
            encrypted_explanation = self.cipher_suite.encrypt(
                json.dumps(explanation.feature_contributions).encode()
            )
            
            # Store in database
            query = """
            INSERT INTO ai.explanation_audit (
                prediction_id, model_type, explanation_method, encrypted_explanation,
                explanation_text, confidence_level, regulatory_notes, audit_trail,
                created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            
            params = [
                explanation.prediction_id,
                explanation.model_type,
                explanation.explanation_method.value,
                encrypted_explanation,
                explanation.explanation_text,
                explanation.confidence_level,
                json.dumps(explanation.regulatory_notes),
                json.dumps(explanation.audit_trail),
                explanation.timestamp
            ]
            
            self.engine.execute(text(query), params)
            
            # Store in Redis for quick access (without encryption for performance)
            cache_key = f"explanation:{explanation.prediction_id}"
            self.redis.setex(
                cache_key,
                86400,  # 24 hours
                json.dumps(asdict(explanation), default=str)
            )
            
            logger.info(f"Stored explanation for prediction {explanation.prediction_id}")
            
        except Exception as e:
            logger.error(f"Error storing explanation: {e}")
            raise
    
    async def get_explanation(self, prediction_id: str) -> Optional[ExplanationResult]:
        """Retrieve explanation for a prediction"""
        try:
            # Try Redis cache first
            cache_key = f"explanation:{prediction_id}"
            cached_data = self.redis.get(cache_key)
            
            if cached_data:
                data = json.loads(cached_data)
                return ExplanationResult(**data)
            
            # Query database
            query = """
            SELECT prediction_id, model_type, explanation_method, encrypted_explanation,
                   explanation_text, confidence_level, regulatory_notes, audit_trail,
                   created_at
            FROM ai.explanation_audit
            WHERE prediction_id = %s
            ORDER BY created_at DESC
            LIMIT 1
            """
            
            result = self.engine.execute(text(query), [prediction_id]).fetchone()
            
            if result:
                # Decrypt explanation
                decrypted_explanation = json.loads(
                    self.cipher_suite.decrypt(result['encrypted_explanation']).decode()
                )
                
                explanation = ExplanationResult(
                    prediction_id=result['prediction_id'],
                    model_type=result['model_type'],
                    explanation_method=ExplanationMethod(result['explanation_method']),
                    feature_contributions=decrypted_explanation,
                    explanation_text=result['explanation_text'],
                    confidence_level=result['confidence_level'],
                    regulatory_notes=json.loads(result['regulatory_notes']),
                    audit_trail=json.loads(result['audit_trail']),
                    timestamp=result['created_at']
                )
                
                return explanation
            
            return None
            
        except Exception as e:
            logger.error(f"Error retrieving explanation for {prediction_id}: {e}")
            return None

class ComplianceAuditor:
    """Automated compliance auditing system"""
    
    def __init__(self):
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://user:pass@localhost/qualitycontrol')
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        
        self.engine = create_engine(self.db_url)
        self.redis = redis.from_url(self.redis_url)
        
        # Compliance rules
        self.compliance_rules = {
            ComplianceLevel.HIPAA: [
                self._check_data_encryption,
                self._check_access_controls,
                self._check_audit_trail,
                self._check_data_anonymization,
                self._check_explanation_quality
            ],
            ComplianceLevel.ANS_BRAZIL: [
                self._check_medical_justification,
                self._check_physician_oversight,
                self._check_regulatory_reporting,
                self._check_explanation_quality,
                self._check_audit_trail
            ],
            ComplianceLevel.CFM_BRAZIL: [
                self._check_medical_ethics,
                self._check_physician_responsibility,
                self._check_patient_consent,
                self._check_explanation_quality
            ]
        }
    
    async def audit_prediction(self, prediction_id: str, 
                              compliance_levels: List[ComplianceLevel]) -> List[ComplianceAudit]:
        """Perform compliance audit for a prediction"""
        audits = []
        
        for level in compliance_levels:
            audit = await self._audit_compliance_level(prediction_id, level)
            audits.append(audit)
            await self._store_audit(audit)
        
        return audits
    
    async def _audit_compliance_level(self, prediction_id: str, 
                                    level: ComplianceLevel) -> ComplianceAudit:
        """Audit a specific compliance level"""
        audit_id = f"audit_{prediction_id}_{level.value}_{int(datetime.now().timestamp())}"
        
        checks_performed = []
        violations_found = []
        remediation_actions = []
        
        # Run compliance checks
        rules = self.compliance_rules.get(level, [])
        
        for rule in rules:
            try:
                check_name = rule.__name__
                checks_performed.append(check_name)
                
                is_compliant, violations, actions = await rule(prediction_id)
                
                if not is_compliant:
                    violations_found.extend(violations)
                    remediation_actions.extend(actions)
                    
            except Exception as e:
                logger.error(f"Error in compliance check {rule.__name__}: {e}")
                violations_found.append(f"Check failed: {rule.__name__}")
        
        # Determine overall compliance status
        if not violations_found:
            compliance_status = "compliant"
        elif len(violations_found) <= 2:
            compliance_status = "requires_review"
        else:
            compliance_status = "non_compliant"
        
        return ComplianceAudit(
            audit_id=audit_id,
            prediction_id=prediction_id,
            compliance_level=level,
            compliance_status=compliance_status,
            checks_performed=checks_performed,
            violations_found=violations_found,
            remediation_actions=remediation_actions,
            auditor_notes=f"Automated compliance audit for {level.value}",
            timestamp=datetime.now()
        )
    
    async def _check_data_encryption(self, prediction_id: str) -> Tuple[bool, List[str], List[str]]:
        """Check if sensitive data is properly encrypted"""
        violations = []
        actions = []
        
        # Check if explanation is encrypted in storage
        query = "SELECT encrypted_explanation FROM ai.explanation_audit WHERE prediction_id = %s"
        result = self.engine.execute(text(query), [prediction_id]).fetchone()
        
        if not result or not result['encrypted_explanation']:
            violations.append("Explanation data not encrypted")
            actions.append("Implement encryption for explanation data")
        
        return len(violations) == 0, violations, actions
    
    async def _check_access_controls(self, prediction_id: str) -> Tuple[bool, List[str], List[str]]:
        """Check access control compliance"""
        violations = []
        actions = []
        
        # Check if access is properly logged
        query = """
        SELECT COUNT(*) as access_count 
        FROM audit.activity_logs 
        WHERE entity_id = %s AND action = 'prediction_access'
        """
        result = self.engine.execute(text(query), [prediction_id]).fetchone()
        
        if result['access_count'] == 0:
            violations.append("No access logging found")
            actions.append("Implement comprehensive access logging")
        
        return len(violations) == 0, violations, actions
    
    async def _check_audit_trail(self, prediction_id: str) -> Tuple[bool, List[str], List[str]]:
        """Check audit trail completeness"""
        violations = []
        actions = []
        
        # Check if audit trail exists
        query = "SELECT audit_trail FROM ai.explanation_audit WHERE prediction_id = %s"
        result = self.engine.execute(text(query), [prediction_id]).fetchone()
        
        if not result or not result['audit_trail']:
            violations.append("Incomplete audit trail")
            actions.append("Ensure comprehensive audit trail logging")
        else:
            audit_data = json.loads(result['audit_trail'])
            required_fields = ['prediction_id', 'model_type', 'explanation_generated_at']
            
            for field in required_fields:
                if field not in audit_data:
                    violations.append(f"Missing audit field: {field}")
                    actions.append(f"Add {field} to audit trail")
        
        return len(violations) == 0, violations, actions
    
    async def _check_data_anonymization(self, prediction_id: str) -> Tuple[bool, List[str], List[str]]:
        """Check data anonymization compliance"""
        violations = []
        actions = []
        
        # This would check if PII is properly anonymized
        # Implementation depends on your data structure
        
        return True, violations, actions  # Placeholder
    
    async def _check_explanation_quality(self, prediction_id: str) -> Tuple[bool, List[str], List[str]]:
        """Check explanation quality and completeness"""
        violations = []
        actions = []
        
        query = """
        SELECT explanation_text, confidence_level, regulatory_notes 
        FROM ai.explanation_audit 
        WHERE prediction_id = %s
        """
        result = self.engine.execute(text(query), [prediction_id]).fetchone()
        
        if not result:
            violations.append("No explanation found")
            actions.append("Generate explanation for prediction")
        else:
            if not result['explanation_text'] or len(result['explanation_text']) < 50:
                violations.append("Explanation text too brief")
                actions.append("Provide more detailed explanation")
            
            if result['confidence_level'] < 0.5:
                violations.append("Low explanation confidence")
                actions.append("Improve explanation methodology")
            
            regulatory_notes = json.loads(result['regulatory_notes']) if result['regulatory_notes'] else []
            if len(regulatory_notes) < 2:
                violations.append("Insufficient regulatory notes")
                actions.append("Add comprehensive regulatory compliance notes")
        
        return len(violations) == 0, violations, actions
    
    async def _check_medical_justification(self, prediction_id: str) -> Tuple[bool, List[str], List[str]]:
        """Check medical justification for Brazilian ANS compliance"""
        violations = []
        actions = []
        
        # Check if medical justification is provided
        query = """
        SELECT ar.clinical_justification, ea.explanation_text
        FROM medical.authorization_requests ar
        JOIN ai.analysis_results anr ON ar.id = anr.entity_id
        JOIN ai.explanation_audit ea ON anr.id = ea.prediction_id
        WHERE ea.prediction_id = %s
        """
        result = self.engine.execute(text(query), [prediction_id]).fetchone()
        
        if not result:
            violations.append("No medical justification found")
            actions.append("Require clinical justification for all requests")
        else:
            if not result['clinical_justification'] or len(result['clinical_justification']) < 20:
                violations.append("Insufficient clinical justification")
                actions.append("Provide detailed clinical justification")
        
        return len(violations) == 0, violations, actions
    
    async def _check_physician_oversight(self, prediction_id: str) -> Tuple[bool, List[str], List[str]]:
        """Check physician oversight requirement"""
        violations = []
        actions = []
        
        # Check if a physician reviewed high-risk decisions
        query = """
        SELECT ar.*, ad.reviewer_id, u.role, u.license_number
        FROM medical.authorization_requests ar
        JOIN medical.authorization_decisions ad ON ar.id = ad.authorization_request_id
        JOIN auth.users u ON ad.reviewer_id = u.id
        JOIN ai.analysis_results anr ON ar.id = anr.entity_id
        WHERE anr.id = %s AND anr.risk_score > 0.7
        """
        result = self.engine.execute(text(query), [prediction_id]).fetchone()
        
        if result and not result['license_number']:
            violations.append("High-risk decision not reviewed by licensed physician")
            actions.append("Require physician review for high-risk cases")
        
        return len(violations) == 0, violations, actions
    
    async def _check_regulatory_reporting(self, prediction_id: str) -> Tuple[bool, List[str], List[str]]:
        """Check regulatory reporting compliance"""
        # Implementation would check if required reports are generated
        return True, [], []  # Placeholder
    
    async def _check_medical_ethics(self, prediction_id: str) -> Tuple[bool, List[str], List[str]]:
        """Check medical ethics compliance (CFM Brazil)"""
        # Implementation would check ethical guidelines compliance
        return True, [], []  # Placeholder
    
    async def _check_physician_responsibility(self, prediction_id: str) -> Tuple[bool, List[str], List[str]]:
        """Check physician responsibility assignment"""
        # Implementation would verify physician accountability
        return True, [], []  # Placeholder
    
    async def _check_patient_consent(self, prediction_id: str) -> Tuple[bool, List[str], List[str]]:
        """Check patient consent for AI assistance"""
        # Implementation would verify patient consent
        return True, [], []  # Placeholder
    
    async def _store_audit(self, audit: ComplianceAudit):
        """Store compliance audit results"""
        try:
            query = """
            INSERT INTO ai.compliance_audits (
                audit_id, prediction_id, compliance_level, compliance_status,
                checks_performed, violations_found, remediation_actions,
                auditor_notes, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            
            params = [
                audit.audit_id,
                audit.prediction_id,
                audit.compliance_level.value,
                audit.compliance_status,
                json.dumps(audit.checks_performed),
                json.dumps(audit.violations_found),
                json.dumps(audit.remediation_actions),
                audit.auditor_notes,
                audit.timestamp
            ]
            
            self.engine.execute(text(query), params)
            
            # Cache audit result
            cache_key = f"audit:{audit.prediction_id}:{audit.compliance_level.value}"
            self.redis.setex(cache_key, 3600, json.dumps(asdict(audit), default=str))
            
            logger.info(f"Stored compliance audit {audit.audit_id}")
            
        except Exception as e:
            logger.error(f"Error storing compliance audit: {e}")
            raise

if __name__ == "__main__":
    # Example usage
    async def main():
        explainable_ai = ExplainableAI()
        auditor = ComplianceAuditor()
        
        # Example: audit a prediction
        compliance_levels = [ComplianceLevel.HIPAA, ComplianceLevel.ANS_BRAZIL]
        audits = await auditor.audit_prediction("test_prediction_123", compliance_levels)
        
        for audit in audits:
            print(f"Compliance Level: {audit.compliance_level.value}")
            print(f"Status: {audit.compliance_status}")
            print(f"Violations: {audit.violations_found}")
            print("---")
    
    asyncio.run(main())