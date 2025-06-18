"""
AI Decision Pipeline for Medical Audit Cases
Orchestrates multiple AI models to provide comprehensive analysis
"""
import asyncio
from typing import Any, Dict, List, Optional, Tuple
import time
from datetime import datetime
import uuid
from loguru import logger
import numpy as np

from .base import BaseAIModel, ModelInput, ModelPrediction, EnsembleModel
from .bert_medical import BERTMedicalModel
from .gpt4_medical import GPT4MedicalModel
from .xgboost_fraud import XGBoostFraudModel
from .lstm_patterns import LSTMPatternModel


class DecisionStage:
    """Represents a stage in the decision pipeline."""
    
    def __init__(self, name: str, model: BaseAIModel, weight: float = 1.0):
        self.name = name
        self.model = model
        self.weight = weight
        self.result = None
        self.error = None


class AuditDecisionPipeline(EnsembleModel):
    """
    Comprehensive AI pipeline for medical audit decisions.
    Combines multiple AI models to provide thorough analysis.
    """
    
    def __init__(self, config: Dict[str, Any]):
        # Initialize models
        bert_config = config.get("bert_config", {})
        gpt4_config = config.get("gpt4_config", {})
        xgboost_config = config.get("xgboost_config", {})
        lstm_config = config.get("lstm_config", {})
        
        models = [
            BERTMedicalModel(bert_config),
            GPT4MedicalModel(gpt4_config),
            XGBoostFraudModel(xgboost_config),
            LSTMPatternModel(lstm_config)
        ]
        
        super().__init__(config, models)
        
        # Pipeline configuration
        self.decision_threshold = config.get("decision_threshold", 0.75)
        self.require_explanation = config.get("require_explanation", True)
        self.enable_parallel = config.get("enable_parallel", True)
        
        # Stage weights
        stage_weights = config.get("stage_weights", {})
        self.stages = [
            DecisionStage("medical_validation", self.models[0], 
                         stage_weights.get("medical_validation", 0.3)),
            DecisionStage("expert_review", self.models[1], 
                         stage_weights.get("expert_review", 0.3)),
            DecisionStage("fraud_detection", self.models[2], 
                         stage_weights.get("fraud_detection", 0.2)),
            DecisionStage("pattern_analysis", self.models[3], 
                         stage_weights.get("pattern_analysis", 0.2))
        ]
    
    async def predict(self, input_data: ModelInput) -> ModelPrediction:
        """
        Execute the complete decision pipeline.
        """
        start_time = time.time()
        pipeline_id = str(uuid.uuid4())
        
        logger.info(f"Starting audit decision pipeline: {pipeline_id}")
        
        # Validate input
        is_valid, error = await self.validate_input(input_data)
        if not is_valid:
            return self._create_error_response(error, start_time)
        
        # Execute pipeline stages
        if self.enable_parallel:
            stage_results = await self._execute_parallel(input_data)
        else:
            stage_results = await self._execute_sequential(input_data)
        
        # Combine results
        decision = self._combine_decisions(stage_results)
        
        # Generate comprehensive explanation
        explanation = self._generate_comprehensive_explanation(stage_results, decision)
        
        # Calculate overall confidence
        confidence = self._calculate_overall_confidence(stage_results)
        
        processing_time = (time.time() - start_time) * 1000
        
        logger.info(f"Pipeline {pipeline_id} completed in {processing_time:.2f}ms")
        
        return ModelPrediction(
            model_name="Audit Decision Pipeline",
            model_version=self.model_version,
            prediction={
                "final_decision": decision["status"],
                "confidence_score": confidence,
                "stage_results": self._format_stage_results(stage_results),
                "risk_assessment": decision["risk_assessment"],
                "recommendations": decision["recommendations"],
                "compliance_status": decision["compliance_status"],
                "required_actions": decision["required_actions"],
                "pipeline_id": pipeline_id
            },
            confidence=confidence,
            explanation=explanation,
            features_used=self._get_all_features_used(stage_results),
            processing_time_ms=processing_time
        )
    
    async def _execute_parallel(self, input_data: ModelInput) -> List[DecisionStage]:
        """Execute pipeline stages in parallel."""
        tasks = []
        
        for stage in self.stages:
            task = asyncio.create_task(self._execute_stage(stage, input_data))
            tasks.append(task)
        
        await asyncio.gather(*tasks)
        
        return self.stages
    
    async def _execute_sequential(self, input_data: ModelInput) -> List[DecisionStage]:
        """Execute pipeline stages sequentially."""
        for stage in self.stages:
            await self._execute_stage(stage, input_data)
        
        return self.stages
    
    async def _execute_stage(self, stage: DecisionStage, input_data: ModelInput) -> None:
        """Execute a single pipeline stage."""
        try:
            logger.debug(f"Executing stage: {stage.name}")
            stage.result = await stage.model.predict(input_data)
        except Exception as e:
            logger.error(f"Stage {stage.name} failed: {e}")
            stage.error = str(e)
    
    def _combine_decisions(self, stages: List[DecisionStage]) -> Dict[str, Any]:
        """Combine decisions from all stages."""
        decisions = {
            "approved": 0,
            "denied": 0,
            "requires_review": 0
        }
        
        risk_scores = []
        recommendations = []
        compliance_issues = []
        
        for stage in stages:
            if stage.result and not stage.error:
                # Extract decision from stage
                stage_decision = self._extract_stage_decision(stage)
                if stage_decision:
                    decisions[stage_decision] += stage.weight
                
                # Collect risk scores
                risk_score = self._extract_risk_score(stage)
                if risk_score is not None:
                    risk_scores.append(risk_score * stage.weight)
                
                # Collect recommendations
                stage_recommendations = self._extract_recommendations(stage)
                recommendations.extend(stage_recommendations)
                
                # Check compliance
                compliance = self._extract_compliance_status(stage)
                if compliance and not compliance.get("is_compliant", True):
                    compliance_issues.extend(compliance.get("issues", []))
        
        # Determine final decision
        total_weight = sum(decisions.values())
        if total_weight > 0:
            approval_score = decisions["approved"] / total_weight
            denial_score = decisions["denied"] / total_weight
            
            if approval_score >= self.decision_threshold:
                final_status = "approved"
            elif denial_score >= self.decision_threshold:
                final_status = "denied"
            else:
                final_status = "requires_review"
        else:
            final_status = "requires_review"
        
        # Calculate overall risk
        overall_risk = np.mean(risk_scores) if risk_scores else 0.5
        risk_level = self._categorize_risk(overall_risk)
        
        return {
            "status": final_status,
            "risk_assessment": {
                "score": float(overall_risk),
                "level": risk_level
            },
            "recommendations": list(set(recommendations))[:10],  # Top 10 unique
            "compliance_status": {
                "is_compliant": len(compliance_issues) == 0,
                "issues": compliance_issues
            },
            "required_actions": self._determine_required_actions(
                final_status, risk_level, compliance_issues
            )
        }
    
    def _extract_stage_decision(self, stage: DecisionStage) -> Optional[str]:
        """Extract decision from stage result."""
        if stage.name == "medical_validation":
            classification = stage.result.prediction.get("classification", {})
            if classification.get("appropriate_procedure", 0) > 0.7:
                return "approved"
            elif classification.get("unnecessary_procedure", 0) > 0.6:
                return "denied"
        
        elif stage.name == "expert_review":
            decision = stage.result.prediction.get("decision", "")
            return decision if decision in ["approved", "denied", "requires_review"] else None
        
        elif stage.name == "fraud_detection":
            risk_level = stage.result.prediction.get("risk_level", "")
            if risk_level == "high":
                return "denied"
            elif risk_level == "minimal":
                return "approved"
        
        elif stage.name == "pattern_analysis":
            patterns = stage.result.prediction.get("detected_patterns", [])
            if any(p["type"] == "protocol_deviation" and p["confidence"] > 0.8 for p in patterns):
                return "denied"
        
        return "requires_review"
    
    def _extract_risk_score(self, stage: DecisionStage) -> Optional[float]:
        """Extract risk score from stage result."""
        if stage.name == "medical_validation":
            return stage.result.prediction.get("risk_score", 0.5)
        elif stage.name == "fraud_detection":
            return stage.result.prediction.get("fraud_probability", 0.5)
        elif stage.name == "pattern_analysis":
            metrics = stage.result.prediction.get("risk_metrics", {})
            return metrics.get("sequence_volatility", 0.5)
        return None
    
    def _extract_recommendations(self, stage: DecisionStage) -> List[str]:
        """Extract recommendations from stage result."""
        recommendations = []
        
        if stage.name == "medical_validation":
            recommendations = stage.result.prediction.get("recommendations", [])
        elif stage.name == "expert_review":
            recommendations = stage.result.prediction.get("recommendations", [])
        elif stage.name == "pattern_analysis":
            recommendations = stage.result.prediction.get("recommendations", [])
        
        return recommendations
    
    def _extract_compliance_status(self, stage: DecisionStage) -> Optional[Dict[str, Any]]:
        """Extract compliance status from stage result."""
        if stage.name == "expert_review":
            return stage.result.prediction.get("compliance_check", {})
        return None
    
    def _categorize_risk(self, risk_score: float) -> str:
        """Categorize risk level based on score."""
        if risk_score >= 0.8:
            return "critical"
        elif risk_score >= 0.6:
            return "high"
        elif risk_score >= 0.4:
            return "medium"
        elif risk_score >= 0.2:
            return "low"
        return "minimal"
    
    def _determine_required_actions(self, decision: str, risk_level: str, 
                                  compliance_issues: List[str]) -> List[str]:
        """Determine required actions based on decision and risk."""
        actions = []
        
        if decision == "denied":
            actions.append("Notificar prestador sobre negativa com justificativa detalhada")
        elif decision == "requires_review":
            actions.append("Encaminhar para revisão manual por auditor especializado")
        
        if risk_level in ["critical", "high"]:
            actions.append("Iniciar investigação detalhada de possível fraude")
        
        if compliance_issues:
            actions.append("Solicitar documentação adicional para conformidade")
        
        if decision == "approved" and risk_level in ["medium", "high"]:
            actions.append("Monitorar continuamente este caso")
        
        return actions
    
    def _calculate_overall_confidence(self, stages: List[DecisionStage]) -> float:
        """Calculate overall confidence from all stages."""
        confidences = []
        
        for stage in stages:
            if stage.result and not stage.error:
                confidences.append(stage.result.confidence * stage.weight)
        
        if confidences:
            # Weighted average
            return float(sum(confidences) / sum(stage.weight for stage in stages 
                                              if stage.result and not stage.error))
        return 0.0
    
    def _format_stage_results(self, stages: List[DecisionStage]) -> Dict[str, Any]:
        """Format stage results for output."""
        results = {}
        
        for stage in stages:
            if stage.result:
                results[stage.name] = {
                    "status": "completed",
                    "confidence": stage.result.confidence,
                    "processing_time_ms": stage.result.processing_time_ms,
                    "key_findings": self._extract_key_findings(stage)
                }
            elif stage.error:
                results[stage.name] = {
                    "status": "failed",
                    "error": stage.error
                }
        
        return results
    
    def _extract_key_findings(self, stage: DecisionStage) -> List[str]:
        """Extract key findings from stage result."""
        findings = []
        
        if stage.name == "medical_validation":
            entities = stage.result.prediction.get("entities", [])
            if entities:
                findings.append(f"Identificadas {len(entities)} entidades médicas relevantes")
        
        elif stage.name == "fraud_detection":
            indicators = stage.result.prediction.get("fraud_indicators", [])
            if indicators:
                findings.append(f"{len(indicators)} indicadores de fraude detectados")
        
        elif stage.name == "pattern_analysis":
            patterns = stage.result.prediction.get("detected_patterns", [])
            if patterns:
                findings.append(f"Padrões anômalos: {', '.join(p['type'] for p in patterns[:3])}")
        
        return findings
    
    def _generate_comprehensive_explanation(self, stages: List[DecisionStage], 
                                          decision: Dict[str, Any]) -> str:
        """Generate comprehensive explanation combining all stages."""
        parts = [
            f"Decisão final: {decision['status'].upper()}",
            f"Nível de risco: {decision['risk_assessment']['level'].upper()}"
        ]
        
        # Add stage-specific explanations
        for stage in stages:
            if stage.result and stage.result.explanation:
                parts.append(f"{stage.name.replace('_', ' ').title()}: {stage.result.explanation}")
        
        # Add compliance status
        if not decision["compliance_status"]["is_compliant"]:
            parts.append(f"Problemas de conformidade: {len(decision['compliance_status']['issues'])}")
        
        # Add confidence assessment
        overall_confidence = self._calculate_overall_confidence(stages)
        if overall_confidence >= 0.8:
            parts.append("Alta confiança na análise integrada")
        elif overall_confidence >= 0.6:
            parts.append("Confiança moderada - revisão humana recomendada")
        else:
            parts.append("Baixa confiança - revisão humana essencial")
        
        return " | ".join(parts)
    
    def _get_all_features_used(self, stages: List[DecisionStage]) -> List[str]:
        """Get all features used across all stages."""
        all_features = set()
        
        for stage in stages:
            if stage.result and stage.result.features_used:
                all_features.update(stage.result.features_used)
        
        return list(all_features)
    
    def _create_error_response(self, error: str, start_time: float) -> ModelPrediction:
        """Create error response for invalid input."""
        processing_time = (time.time() - start_time) * 1000
        
        return ModelPrediction(
            model_name="Audit Decision Pipeline",
            model_version=self.model_version,
            prediction={
                "status": "error",
                "error": error
            },
            confidence=0.0,
            explanation=f"Erro na validação: {error}",
            processing_time_ms=processing_time
        )
    
    async def validate_input(self, input_data: ModelInput) -> Tuple[bool, Optional[str]]:
        """Validate input for all pipeline stages."""
        # Basic validation
        if not input_data.data:
            return False, "Dados de entrada vazios"
        
        # Each model will validate its specific requirements
        # Here we just check common fields
        required_common_fields = ["procedure_code", "diagnosis_code"]
        
        for field in required_common_fields:
            if field not in input_data.data:
                return False, f"Campo obrigatório ausente: {field}"
        
        return True, None