"""
XGBoost Fraud Detection Model for Medical Claims
"""
import xgboost as xgb
import numpy as np
import pandas as pd
from typing import Any, Dict, List, Optional, Tuple
import time
import joblib
from loguru import logger
from sklearn.preprocessing import StandardScaler

from .base import BaseAIModel, ModelInput, ModelPrediction


class XGBoostFraudModel(BaseAIModel):
    """XGBoost model for detecting fraudulent medical claims."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.model_path = config.get("model_path", "models/xgboost_fraud.pkl")
        self.scaler_path = config.get("scaler_path", "models/fraud_scaler.pkl")
        self.threshold_low = config.get("thresholds", {}).get("low_risk", 0.3)
        self.threshold_medium = config.get("thresholds", {}).get("medium_risk", 0.6)
        self.threshold_high = config.get("thresholds", {}).get("high_risk", 0.8)
        self.model = None
        self.scaler = None
        self.feature_names = config.get("features", [])
    
    async def load_model(self) -> None:
        """Load XGBoost model and scaler from disk."""
        try:
            logger.info("Loading XGBoost fraud detection model")
            
            # For demo purposes, we'll create a simple model
            # In production, load from saved file
            self._create_demo_model()
            
            self.is_loaded = True
            logger.info("XGBoost fraud detection model loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load XGBoost model: {e}")
            raise
    
    def _create_demo_model(self):
        """Create a demo model for testing."""
        # Create synthetic training data
        np.random.seed(42)
        n_samples = 1000
        
        # Generate features
        X = np.random.randn(n_samples, len(self.feature_names))
        
        # Create synthetic labels (10% fraud)
        y = np.random.choice([0, 1], size=n_samples, p=[0.9, 0.1])
        
        # Make some patterns for fraud
        X[y == 1, 0] += 2  # Higher claim frequency for fraud
        X[y == 1, 3] += 1.5  # Different network patterns
        
        # Train model
        self.model = xgb.XGBClassifier(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            objective='binary:logistic',
            random_state=42
        )
        
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled, y)
    
    async def predict(self, input_data: ModelInput) -> ModelPrediction:
        """Predict fraud probability for medical claim."""
        start_time = time.time()
        
        # Extract features
        features = self._extract_features(input_data)
        
        # Create feature dataframe
        feature_df = pd.DataFrame([features], columns=self.feature_names)
        
        # Scale features
        features_scaled = self.scaler.transform(feature_df)
        
        # Get prediction and probability
        fraud_probability = float(self.model.predict_proba(features_scaled)[0, 1])
        
        # Determine risk level
        risk_level = self._determine_risk_level(fraud_probability)
        
        # Get feature importance for explanation
        feature_importance = self._get_feature_importance(features)
        
        # Generate fraud indicators
        fraud_indicators = self._identify_fraud_indicators(features, fraud_probability)
        
        processing_time = (time.time() - start_time) * 1000
        
        return ModelPrediction(
            model_name=self.model_name,
            model_version=self.model_version,
            prediction={
                "fraud_probability": fraud_probability,
                "risk_level": risk_level,
                "fraud_indicators": fraud_indicators,
                "feature_importance": feature_importance,
                "recommended_action": self._recommend_action(risk_level)
            },
            confidence=self._calculate_confidence(fraud_probability),
            explanation=self._generate_explanation(risk_level, fraud_indicators),
            features_used=self.feature_names,
            processing_time_ms=processing_time
        )
    
    def _extract_features(self, input_data: ModelInput) -> Dict[str, float]:
        """Extract fraud detection features from input data."""
        data = input_data.data
        provider_info = data.get("provider_info", {})
        
        # Calculate features
        features = {
            "provider_claim_frequency": self._calculate_claim_frequency(provider_info),
            "procedure_code_patterns": self._analyze_procedure_patterns(data),
            "value_anomaly_score": self._calculate_value_anomaly(data),
            "network_relationship_score": self._analyze_network_relationships(provider_info),
            "temporal_pattern_score": self._analyze_temporal_patterns(data),
            "geographic_anomaly_score": self._calculate_geographic_anomaly(provider_info)
        }
        
        return features
    
    def _calculate_claim_frequency(self, provider_info: Dict) -> float:
        """Calculate provider claim frequency score."""
        monthly_claims = provider_info.get("monthly_claims", 50)
        avg_claims = provider_info.get("average_monthly_claims", 40)
        
        if avg_claims > 0:
            frequency_ratio = monthly_claims / avg_claims
            return min(frequency_ratio, 5.0)  # Cap at 5x average
        return 1.0
    
    def _analyze_procedure_patterns(self, data: Dict) -> float:
        """Analyze procedure code patterns for anomalies."""
        procedure_code = data.get("procedure_code", "")
        procedure_history = data.get("procedure_history", [])
        
        # Check for unusual procedure combinations
        unusual_combinations = 0
        if procedure_history:
            # Simplified logic - in production, use actual medical logic
            recent_procedures = set(procedure_history[-10:])
            if len(recent_procedures) > 7:  # Too many different procedures
                unusual_combinations += 1
        
        return float(unusual_combinations)
    
    def _calculate_value_anomaly(self, data: Dict) -> float:
        """Calculate cost anomaly score."""
        requested_value = data.get("cost_requested", 0)
        avg_procedure_cost = data.get("average_procedure_cost", requested_value)
        
        if avg_procedure_cost > 0:
            ratio = requested_value / avg_procedure_cost
            if ratio > 2.0:  # More than 2x average
                return min((ratio - 1.0), 5.0)
        return 0.0
    
    def _analyze_network_relationships(self, provider_info: Dict) -> float:
        """Analyze provider network relationships."""
        network_size = provider_info.get("network_size", 10)
        shared_patients = provider_info.get("shared_patients_ratio", 0.1)
        
        # Suspicious if small network with high patient sharing
        if network_size < 5 and shared_patients > 0.5:
            return 2.0
        elif network_size < 10 and shared_patients > 0.3:
            return 1.0
        return 0.0
    
    def _analyze_temporal_patterns(self, data: Dict) -> float:
        """Analyze temporal patterns in claims."""
        claim_times = data.get("recent_claim_times", [])
        
        if len(claim_times) > 5:
            # Check for clustering (many claims in short period)
            time_diffs = np.diff(sorted(claim_times))
            if len(time_diffs) > 0:
                avg_diff = np.mean(time_diffs)
                if avg_diff < 2:  # Less than 2 days average
                    return 2.0
                elif avg_diff < 7:  # Less than a week
                    return 1.0
        return 0.0
    
    def _calculate_geographic_anomaly(self, provider_info: Dict) -> float:
        """Calculate geographic anomaly score."""
        provider_location = provider_info.get("location", {})
        patient_locations = provider_info.get("patient_locations", [])
        
        if provider_location and patient_locations:
            # Simplified distance calculation
            avg_distance = provider_info.get("avg_patient_distance", 20)
            if avg_distance > 100:  # More than 100km average
                return 2.0
            elif avg_distance > 50:
                return 1.0
        return 0.0
    
    def _determine_risk_level(self, probability: float) -> str:
        """Determine risk level based on probability."""
        if probability >= self.threshold_high:
            return "high"
        elif probability >= self.threshold_medium:
            return "medium"
        elif probability >= self.threshold_low:
            return "low"
        return "minimal"
    
    def _get_feature_importance(self, features: Dict[str, float]) -> Dict[str, float]:
        """Get feature importance for explanation."""
        if self.model is None:
            return {}
        
        importance = self.model.feature_importances_
        feature_importance = {}
        
        for i, (feature_name, feature_value) in enumerate(features.items()):
            if i < len(importance):
                feature_importance[feature_name] = {
                    "importance": float(importance[i]),
                    "value": feature_value
                }
        
        return feature_importance
    
    def _identify_fraud_indicators(self, features: Dict[str, float], 
                                 probability: float) -> List[Dict[str, Any]]:
        """Identify specific fraud indicators."""
        indicators = []
        
        if features["provider_claim_frequency"] > 2.0:
            indicators.append({
                "type": "high_frequency",
                "severity": "high",
                "description": "Frequência de solicitações anormalmente alta"
            })
        
        if features["value_anomaly_score"] > 1.5:
            indicators.append({
                "type": "cost_anomaly",
                "severity": "medium",
                "description": "Valor solicitado significativamente acima da média"
            })
        
        if features["network_relationship_score"] > 1.0:
            indicators.append({
                "type": "network_pattern",
                "severity": "medium",
                "description": "Padrões suspeitos de relacionamento na rede"
            })
        
        if features["temporal_pattern_score"] > 1.0:
            indicators.append({
                "type": "temporal_clustering",
                "severity": "low",
                "description": "Agrupamento temporal de solicitações"
            })
        
        return indicators
    
    def _recommend_action(self, risk_level: str) -> str:
        """Recommend action based on risk level."""
        actions = {
            "high": "Bloquear autorização e iniciar investigação detalhada",
            "medium": "Solicitar documentação adicional antes da aprovação",
            "low": "Aprovar com monitoramento contínuo",
            "minimal": "Aprovar normalmente"
        }
        return actions.get(risk_level, "Revisar manualmente")
    
    def _calculate_confidence(self, probability: float) -> float:
        """Calculate model confidence based on probability."""
        # Higher confidence when probability is extreme (very high or very low)
        distance_from_middle = abs(probability - 0.5) * 2
        return 0.6 + (distance_from_middle * 0.4)
    
    def _generate_explanation(self, risk_level: str, indicators: List[Dict]) -> str:
        """Generate human-readable explanation."""
        explanation_parts = [f"Nível de risco de fraude: {risk_level.upper()}"]
        
        if indicators:
            explanation_parts.append(
                f"Identificados {len(indicators)} indicadores de possível fraude"
            )
            
            # Add top indicators
            for indicator in indicators[:3]:
                explanation_parts.append(f"- {indicator['description']}")
        else:
            explanation_parts.append("Nenhum indicador significativo de fraude detectado")
        
        return " | ".join(explanation_parts)
    
    async def validate_input(self, input_data: ModelInput) -> Tuple[bool, Optional[str]]:
        """Validate input data for fraud detection."""
        required_fields = ["cost_requested", "procedure_code", "provider_info"]
        
        for field in required_fields:
            if field not in input_data.data:
                return False, f"Campo obrigatório ausente: {field}"
        
        # Validate provider info
        provider_info = input_data.data.get("provider_info", {})
        if not isinstance(provider_info, dict):
            return False, "provider_info deve ser um dicionário"
        
        return True, None