#!/usr/bin/env python3
"""
ML Service for QualityControl Healthcare Platform
Provides real-time inference for authorization, fraud detection, risk assessment, and cost prediction.
"""

import os
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
import joblib
import redis
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import mlflow
import mlflow.sklearn
import mlflow.pytorch
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from starlette.responses import Response

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="QualityControl ML Service",
    description="Machine Learning inference service for healthcare authorization platform",
    version="2.1.0",
    docs_url="/ml/docs",
    openapi_url="/ml/openapi.json"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()

# Prometheus metrics
PREDICTION_COUNTER = Counter('ml_predictions_total', 'Total ML predictions', ['model_type', 'status'])
PREDICTION_LATENCY = Histogram('ml_prediction_duration_seconds', 'Prediction latency', ['model_type'])
MODEL_ACCURACY = Gauge('ml_model_accuracy', 'Model accuracy', ['model_type'])
ACTIVE_MODELS = Gauge('ml_active_models', 'Number of active models')

# Configuration
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://user:pass@localhost/qualitycontrol')
MLFLOW_TRACKING_URI = os.getenv('MLFLOW_TRACKING_URI', 'http://localhost:5000')
ML_SERVICE_API_KEY = os.getenv('ML_SERVICE_API_KEY', 'your-secret-key')

# Initialize connections
redis_client = redis.from_url(REDIS_URL)
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)

# Pydantic models
class FeatureVector(BaseModel):
    patient_features: Dict[str, float]
    provider_features: Dict[str, float]
    procedure_features: Dict[str, float]
    temporal_features: Dict[str, float]
    contextual_features: Dict[str, float]

class PredictionRequest(BaseModel):
    features: FeatureVector
    model_type: str = Field(..., regex="^(authorization|fraud_detection|risk_assessment|cost_prediction)$")
    model_version: Optional[str] = None
    request_metadata: Dict[str, Any] = {}

class AuthorizationPrediction(BaseModel):
    prediction: Dict[str, Any]
    explanation: Dict[str, Any]
    model_info: Dict[str, str]
    processing_time_ms: int

class MLModel:
    """Base class for ML models with common functionality"""
    
    def __init__(self, model_type: str, model_path: str):
        self.model_type = model_type
        self.model_path = model_path
        self.model = None
        self.feature_names = []
        self.model_version = "unknown"
        self.load_model()
    
    def load_model(self):
        """Load model from MLflow or local storage"""
        try:
            if self.model_path.startswith('models:/'):
                # Load from MLflow Model Registry
                self.model = mlflow.sklearn.load_model(self.model_path)
                logger.info(f"Loaded {self.model_type} model from MLflow: {self.model_path}")
            else:
                # Load from local file
                self.model = joblib.load(self.model_path)
                logger.info(f"Loaded {self.model_type} model from file: {self.model_path}")
            
            # Load feature names and metadata
            self._load_metadata()
            
        except Exception as e:
            logger.error(f"Failed to load {self.model_type} model: {e}")
            raise
    
    def _load_metadata(self):
        """Load model metadata including feature names"""
        metadata_path = self.model_path.replace('.pkl', '_metadata.json')
        try:
            import json
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
                self.feature_names = metadata.get('feature_names', [])
                self.model_version = metadata.get('version', 'unknown')
        except FileNotFoundError:
            logger.warning(f"No metadata found for {self.model_type} model")
    
    def preprocess_features(self, features: FeatureVector) -> np.ndarray:
        """Convert feature vector to model input format"""
        feature_dict = {
            **features.patient_features,
            **features.provider_features,
            **features.procedure_features,
            **features.temporal_features,
            **features.contextual_features
        }
        
        # Ensure features are in correct order
        if self.feature_names:
            feature_array = np.array([feature_dict.get(name, 0.0) for name in self.feature_names])
        else:
            feature_array = np.array(list(feature_dict.values()))
        
        return feature_array.reshape(1, -1)
    
    def predict(self, features: FeatureVector) -> Dict[str, Any]:
        """Make prediction - to be implemented by subclasses"""
        raise NotImplementedError
    
    def explain_prediction(self, features: FeatureVector, prediction: Dict[str, Any]) -> Dict[str, Any]:
        """Generate explanation for prediction"""
        feature_array = self.preprocess_features(features)
        
        # Get feature importance (this would use SHAP in production)
        feature_importance = {}
        if hasattr(self.model, 'feature_importances_'):
            for i, importance in enumerate(self.model.feature_importances_):
                feature_name = self.feature_names[i] if i < len(self.feature_names) else f'feature_{i}'
                feature_importance[feature_name] = float(importance)
        
        return {
            'feature_importance': feature_importance,
            'confidence_breakdown': self._calculate_confidence_breakdown(feature_array),
            'decision_boundary': self._get_decision_boundary_info(prediction),
            'factors': self._extract_key_factors(features, feature_importance)
        }
    
    def _calculate_confidence_breakdown(self, feature_array: np.ndarray) -> Dict[str, float]:
        """Calculate confidence breakdown"""
        return {
            'data_quality': 0.9,  # Would be calculated based on feature completeness
            'model_certainty': 0.85,  # Based on prediction probability
            'feature_reliability': 0.88,  # Based on feature quality scores
            'historical_accuracy': 0.92  # Based on recent model performance
        }
    
    def _get_decision_boundary_info(self, prediction: Dict[str, Any]) -> Dict[str, float]:
        """Get decision boundary information"""
        return {
            'threshold': 0.5,
            'margin_to_threshold': 0.3,
            'sensitivity': 0.85,
            'specificity': 0.82
        }
    
    def _extract_key_factors(self, features: FeatureVector, importance: Dict[str, float]) -> List[Dict[str, Any]]:
        """Extract key factors that influenced the prediction"""
        sorted_features = sorted(importance.items(), key=lambda x: abs(x[1]), reverse=True)
        
        factors = []
        for feature_name, impact in sorted_features[:5]:  # Top 5 factors
            factors.append({
                'name': feature_name,
                'impact': float(impact),
                'description': self._get_feature_description(feature_name),
                'category': self._get_feature_category(feature_name)
            })
        
        return factors
    
    def _get_feature_description(self, feature_name: str) -> str:
        """Get human-readable description of feature"""
        descriptions = {
            'age_group': 'Patient age group classification',
            'approval_rate': 'Provider historical approval rate',
            'fraud_incidents': 'Number of fraud incidents',
            'urgency_level': 'Request urgency level',
            'procedure_complexity': 'Procedure complexity score',
            # Add more descriptions as needed
        }
        return descriptions.get(feature_name, f'Feature: {feature_name}')
    
    def _get_feature_category(self, feature_name: str) -> str:
        """Categorize feature for explanation"""
        if 'patient' in feature_name.lower() or 'age' in feature_name.lower():
            return 'patient'
        elif 'provider' in feature_name.lower() or 'approval' in feature_name.lower():
            return 'provider'
        elif 'procedure' in feature_name.lower() or 'complexity' in feature_name.lower():
            return 'procedure'
        elif 'time' in feature_name.lower() or 'urgency' in feature_name.lower():
            return 'temporal'
        else:
            return 'contextual'

class AuthorizationModel(MLModel):
    """Authorization prediction model"""
    
    def predict(self, features: FeatureVector) -> Dict[str, Any]:
        feature_array = self.preprocess_features(features)
        
        # Get prediction and probabilities
        prediction = self.model.predict(feature_array)[0]
        probabilities = self.model.predict_proba(feature_array)[0]
        
        # Map prediction to recommendation
        recommendation_map = {0: 'denied', 1: 'approved', 2: 'requires_review', 3: 'partial_approval'}
        recommendation = recommendation_map.get(prediction, 'requires_review')
        
        # Calculate confidence
        confidence = float(np.max(probabilities))
        
        # Calculate risk score (inverse of approval probability)
        risk_score = float(1.0 - probabilities[1]) if len(probabilities) > 1 else 0.5
        
        # Estimate processing time based on recommendation
        processing_time_map = {'approved': 2, 'denied': 4, 'requires_review': 24, 'partial_approval': 12}
        processing_time = processing_time_map.get(recommendation, 24)
        
        return {
            'recommendation': recommendation,
            'confidence': confidence,
            'risk_score': risk_score,
            'processing_time_hours': processing_time,
            'suggested_reviewer': self._suggest_reviewer(features, recommendation),
            'alternatives': self._generate_alternatives(probabilities, recommendation_map)
        }
    
    def _suggest_reviewer(self, features: FeatureVector, recommendation: str) -> Optional[str]:
        """Suggest appropriate reviewer based on case characteristics"""
        if recommendation == 'requires_review':
            # Complex cases go to senior reviewers
            if features.procedure_features.get('complexity_score', 0) > 0.8:
                return 'senior_medical_director'
            elif features.patient_features.get('risk_category_score', 0) > 0.7:
                return 'specialist_reviewer'
            else:
                return 'standard_reviewer'
        return None
    
    def _generate_alternatives(self, probabilities: np.ndarray, recommendation_map: Dict) -> List[Dict]:
        """Generate alternative recommendations with their probabilities"""
        alternatives = []
        sorted_indices = np.argsort(probabilities)[::-1]
        
        for i in sorted_indices[1:3]:  # Top 2 alternatives
            alt_recommendation = recommendation_map.get(i, 'unknown')
            alt_confidence = float(probabilities[i])
            
            if alt_confidence > 0.1:  # Only include reasonable alternatives
                alternatives.append({
                    'recommendation': alt_recommendation,
                    'confidence': alt_confidence,
                    'required_conditions': self._get_required_conditions(alt_recommendation),
                    'cost_impact': self._estimate_cost_impact(alt_recommendation)
                })
        
        return alternatives
    
    def _get_required_conditions(self, recommendation: str) -> List[str]:
        """Get conditions required for alternative recommendation"""
        conditions_map = {
            'approved': ['Additional documentation provided', 'Medical necessity confirmed'],
            'partial_approval': ['Reduced scope acceptable', 'Alternative treatment available'],
            'denied': ['Cost-benefit analysis unfavorable', 'Alternative treatment required']
        }
        return conditions_map.get(recommendation, [])
    
    def _estimate_cost_impact(self, recommendation: str) -> float:
        """Estimate cost impact of alternative recommendation"""
        impact_map = {'approved': 1.0, 'partial_approval': 0.6, 'denied': 0.0, 'requires_review': 0.0}
        return impact_map.get(recommendation, 0.0)

class FraudModel(MLModel):
    """Fraud detection model"""
    
    def predict(self, features: FeatureVector) -> Dict[str, Any]:
        feature_array = self.preprocess_features(features)
        
        # Get fraud probability
        fraud_probability = float(self.model.predict_proba(feature_array)[0][1])
        
        # Determine risk level
        if fraud_probability >= 0.8:
            risk_level = 'critical'
            priority = 10
        elif fraud_probability >= 0.6:
            risk_level = 'high'
            priority = 8
        elif fraud_probability >= 0.3:
            risk_level = 'medium'
            priority = 5
        else:
            risk_level = 'low'
            priority = 2
        
        # Generate fraud indicators
        indicators = self._generate_fraud_indicators(features, fraud_probability)
        
        return {
            'fraud_probability': fraud_probability,
            'risk_level': risk_level,
            'priority': priority,
            'indicators': indicators,
            'similar_cases': self._find_similar_fraud_cases(features)
        }
    
    def _generate_fraud_indicators(self, features: FeatureVector, fraud_prob: float) -> List[Dict]:
        """Generate specific fraud indicators based on features"""
        indicators = []
        
        # Check for unusual patterns
        if features.provider_features.get('anomaly_score', 0) > 0.7:
            indicators.append({
                'type': 'provider_anomaly',
                'description': 'Provider shows unusual billing patterns',
                'severity': 'high',
                'confidence': 0.85,
                'historical_occurrence': 0.12
            })
        
        if features.patient_features.get('unusual_request_patterns', 0) > 0.6:
            indicators.append({
                'type': 'patient_pattern',
                'description': 'Unusual request timing or frequency',
                'severity': 'medium',
                'confidence': 0.72,
                'historical_occurrence': 0.08
            })
        
        # Add more indicators based on feature analysis
        return indicators
    
    def _find_similar_fraud_cases(self, features: FeatureVector) -> List[Dict]:
        """Find similar historical fraud cases"""
        # This would query historical data in production
        return [
            {
                'case_id': 'fraud_case_123',
                'similarity': 0.85,
                'outcome': 'confirmed_fraud',
                'time_to_resolution': 168  # hours
            }
        ]

class RiskModel(MLModel):
    """Risk assessment model"""
    
    def predict(self, features: FeatureVector) -> Dict[str, Any]:
        feature_array = self.preprocess_features(features)
        
        # Assume model outputs multiple risk scores
        risk_scores = self.model.predict(feature_array)[0]
        
        clinical_risk = float(risk_scores[0]) if len(risk_scores) > 0 else 0.5
        financial_risk = float(risk_scores[1]) if len(risk_scores) > 1 else 0.5
        compliance_risk = float(risk_scores[2]) if len(risk_scores) > 2 else 0.3
        
        # Calculate overall risk as weighted average
        overall_risk = (clinical_risk * 0.4 + financial_risk * 0.4 + compliance_risk * 0.2)
        
        return {
            'clinical_risk': clinical_risk,
            'financial_risk': financial_risk,
            'compliance_risk': compliance_risk,
            'overall_risk': overall_risk,
            'risk_factors': self._identify_risk_factors(features),
            'mitigation_suggestions': self._generate_mitigation_suggestions(overall_risk)
        }
    
    def _identify_risk_factors(self, features: FeatureVector) -> List[Dict]:
        """Identify specific risk factors"""
        risk_factors = []
        
        # Clinical risk factors
        if features.patient_features.get('chronic_condition_complexity', 0) > 0.7:
            risk_factors.append({
                'category': 'clinical',
                'factor': 'Complex chronic conditions',
                'contribution': 0.3,
                'description': 'Patient has multiple complex chronic conditions',
                'mitigation_level': 'high'
            })
        
        # Financial risk factors
        if features.procedure_features.get('value_percentile', 0) > 0.9:
            risk_factors.append({
                'category': 'financial',
                'factor': 'High-value procedure',
                'contribution': 0.25,
                'description': 'Procedure cost is in top 10% of similar procedures',
                'mitigation_level': 'medium'
            })
        
        return risk_factors
    
    def _generate_mitigation_suggestions(self, overall_risk: float) -> List[str]:
        """Generate risk mitigation suggestions"""
        suggestions = []
        
        if overall_risk > 0.7:
            suggestions.extend([
                'Require additional medical review',
                'Obtain second opinion from specialist',
                'Implement enhanced monitoring protocol'
            ])
        elif overall_risk > 0.5:
            suggestions.extend([
                'Schedule follow-up review',
                'Monitor patient outcomes closely'
            ])
        else:
            suggestions.append('Standard care protocols apply')
        
        return suggestions

class CostModel(MLModel):
    """Cost prediction model"""
    
    def predict(self, features: FeatureVector) -> Dict[str, Any]:
        feature_array = self.preprocess_features(features)
        
        # Get cost prediction
        predicted_cost = float(self.model.predict(feature_array)[0])
        
        # Calculate confidence interval (would be more sophisticated in production)
        std_dev = predicted_cost * 0.15  # Assume 15% standard deviation
        cost_range = {
            'min': max(0, predicted_cost - 1.96 * std_dev),
            'max': predicted_cost + 1.96 * std_dev
        }
        
        return {
            'predicted_cost': predicted_cost,
            'cost_range': cost_range,
            'cost_drivers': self._identify_cost_drivers(features),
            'benchmark_comparison': self._get_benchmark_comparison(predicted_cost),
            'optimization_suggestions': self._generate_optimization_suggestions(features, predicted_cost)
        }
    
    def _identify_cost_drivers(self, features: FeatureVector) -> List[Dict]:
        """Identify factors driving cost"""
        return [
            {
                'component': 'Procedure complexity',
                'contribution': 0.35,
                'variance': 0.12,
                'controllable': False
            },
            {
                'component': 'Provider efficiency',
                'contribution': 0.25,
                'variance': 0.08,
                'controllable': True
            }
        ]
    
    def _get_benchmark_comparison(self, predicted_cost: float) -> Dict:
        """Compare against benchmarks"""
        return {
            'percentile': 65,
            'peer_average': predicted_cost * 0.92,
            'market_range': {'min': predicted_cost * 0.7, 'max': predicted_cost * 1.4},
            'historical_trend': 'increasing'
        }
    
    def _generate_optimization_suggestions(self, features: FeatureVector, cost: float) -> List[str]:
        """Generate cost optimization suggestions"""
        suggestions = []
        
        if cost > 10000:  # High-cost procedure
            suggestions.extend([
                'Consider alternative treatment protocols',
                'Evaluate outpatient vs inpatient options',
                'Review necessity of all components'
            ])
        
        return suggestions

# Model manager
class ModelManager:
    """Manages loading and switching of ML models"""
    
    def __init__(self):
        self.models = {}
        self.load_all_models()
    
    def load_all_models(self):
        """Load all models at startup"""
        model_configs = {
            'authorization': {
                'class': AuthorizationModel,
                'path': os.getenv('AUTHORIZATION_MODEL_PATH', './models/authorization_model.pkl')
            },
            'fraud_detection': {
                'class': FraudModel,
                'path': os.getenv('FRAUD_MODEL_PATH', './models/fraud_model.pkl')
            },
            'risk_assessment': {
                'class': RiskModel,
                'path': os.getenv('RISK_MODEL_PATH', './models/risk_model.pkl')
            },
            'cost_prediction': {
                'class': CostModel,
                'path': os.getenv('COST_MODEL_PATH', './models/cost_model.pkl')
            }
        }
        
        for model_type, config in model_configs.items():
            try:
                self.models[model_type] = config['class'](model_type, config['path'])
                logger.info(f"Loaded {model_type} model successfully")
                ACTIVE_MODELS.inc()
            except Exception as e:
                logger.error(f"Failed to load {model_type} model: {e}")
    
    def get_model(self, model_type: str) -> MLModel:
        """Get model by type"""
        if model_type not in self.models:
            raise HTTPException(status_code=404, detail=f"Model {model_type} not found")
        return self.models[model_type]
    
    def reload_model(self, model_type: str):
        """Reload a specific model"""
        if model_type in self.models:
            self.models[model_type].load_model()
            logger.info(f"Reloaded {model_type} model")

# Initialize model manager
model_manager = ModelManager()

# Authentication
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify API token"""
    if credentials.credentials != ML_SERVICE_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return credentials.credentials

# API endpoints
@app.post("/predict/authorization", response_model=AuthorizationPrediction)
async def predict_authorization(
    request: PredictionRequest,
    background_tasks: BackgroundTasks,
    token: str = Depends(verify_token)
):
    """Predict authorization outcome"""
    start_time = datetime.now()
    
    try:
        with PREDICTION_LATENCY.labels(model_type='authorization').time():
            model = model_manager.get_model('authorization')
            prediction = model.predict(request.features)
            explanation = model.explain_prediction(request.features, prediction)
            
            result = AuthorizationPrediction(
                prediction=prediction,
                explanation=explanation,
                model_info={
                    'type': 'authorization',
                    'version': model.model_version
                },
                processing_time_ms=int((datetime.now() - start_time).total_seconds() * 1000)
            )
            
            PREDICTION_COUNTER.labels(model_type='authorization', status='success').inc()
            
            # Log prediction for monitoring
            background_tasks.add_task(
                log_prediction,
                'authorization',
                request.request_metadata.get('request_id'),
                prediction,
                result.processing_time_ms
            )
            
            return result
            
    except Exception as e:
        PREDICTION_COUNTER.labels(model_type='authorization', status='error').inc()
        logger.error(f"Authorization prediction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/fraud")
async def predict_fraud(
    request: PredictionRequest,
    background_tasks: BackgroundTasks,
    token: str = Depends(verify_token)
):
    """Predict fraud probability"""
    start_time = datetime.now()
    
    try:
        with PREDICTION_LATENCY.labels(model_type='fraud').time():
            model = model_manager.get_model('fraud_detection')
            prediction = model.predict(request.features)
            explanation = model.explain_prediction(request.features, prediction)
            
            result = {
                'prediction': prediction,
                'explanation': explanation,
                'model_info': {
                    'type': 'fraud_detection',
                    'version': model.model_version
                },
                'processing_time_ms': int((datetime.now() - start_time).total_seconds() * 1000)
            }
            
            PREDICTION_COUNTER.labels(model_type='fraud', status='success').inc()
            
            background_tasks.add_task(
                log_prediction,
                'fraud_detection',
                request.request_metadata.get('request_id'),
                prediction,
                result['processing_time_ms']
            )
            
            return result
            
    except Exception as e:
        PREDICTION_COUNTER.labels(model_type='fraud', status='error').inc()
        logger.error(f"Fraud prediction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/risk")
async def predict_risk(
    request: PredictionRequest,
    background_tasks: BackgroundTasks,
    token: str = Depends(verify_token)
):
    """Assess risk levels"""
    start_time = datetime.now()
    
    try:
        with PREDICTION_LATENCY.labels(model_type='risk').time():
            model = model_manager.get_model('risk_assessment')
            prediction = model.predict(request.features)
            explanation = model.explain_prediction(request.features, prediction)
            
            result = {
                'prediction': prediction,
                'explanation': explanation,
                'model_info': {
                    'type': 'risk_assessment',
                    'version': model.model_version
                },
                'processing_time_ms': int((datetime.now() - start_time).total_seconds() * 1000)
            }
            
            PREDICTION_COUNTER.labels(model_type='risk', status='success').inc()
            
            background_tasks.add_task(
                log_prediction,
                'risk_assessment',
                request.request_metadata.get('request_id'),
                prediction,
                result['processing_time_ms']
            )
            
            return result
            
    except Exception as e:
        PREDICTION_COUNTER.labels(model_type='risk', status='error').inc()
        logger.error(f"Risk assessment failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict/cost")
async def predict_cost(
    request: PredictionRequest,
    background_tasks: BackgroundTasks,
    token: str = Depends(verify_token)
):
    """Predict procedure cost"""
    start_time = datetime.now()
    
    try:
        with PREDICTION_LATENCY.labels(model_type='cost').time():
            model = model_manager.get_model('cost_prediction')
            prediction = model.predict(request.features)
            explanation = model.explain_prediction(request.features, prediction)
            
            result = {
                'prediction': prediction,
                'explanation': explanation,
                'model_info': {
                    'type': 'cost_prediction',
                    'version': model.model_version
                },
                'processing_time_ms': int((datetime.now() - start_time).total_seconds() * 1000)
            }
            
            PREDICTION_COUNTER.labels(model_type='cost', status='success').inc()
            
            background_tasks.add_task(
                log_prediction,
                'cost_prediction',
                request.request_metadata.get('request_id'),
                prediction,
                result['processing_time_ms']
            )
            
            return result
            
    except Exception as e:
        PREDICTION_COUNTER.labels(model_type='cost', status='error').inc()
        logger.error(f"Cost prediction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'models_loaded': len(model_manager.models),
        'redis_connected': await check_redis_connection(),
        'database_connected': await check_database_connection()
    }

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(generate_latest(), media_type="text/plain")

@app.post("/models/{model_type}/reload")
async def reload_model(model_type: str, token: str = Depends(verify_token)):
    """Reload a specific model"""
    try:
        model_manager.reload_model(model_type)
        return {'status': 'success', 'message': f'Model {model_type} reloaded'}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Background tasks
async def log_prediction(model_type: str, request_id: str, prediction: Dict, processing_time: int):
    """Log prediction for monitoring and model improvement"""
    log_data = {
        'model_type': model_type,
        'request_id': request_id,
        'prediction': prediction,
        'processing_time_ms': processing_time,
        'timestamp': datetime.now().isoformat()
    }
    
    # Store in Redis for real-time monitoring
    redis_client.lpush('ml_predictions', str(log_data))
    redis_client.ltrim('ml_predictions', 0, 10000)  # Keep last 10k predictions
    
    logger.info(f"Logged {model_type} prediction", extra=log_data)

async def check_redis_connection() -> bool:
    """Check Redis connectivity"""
    try:
        redis_client.ping()
        return True
    except:
        return False

async def check_database_connection() -> bool:
    """Check database connectivity"""
    try:
        engine.execute("SELECT 1")
        return True
    except:
        return False

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    logger.info("ML Service starting up...")
    
    # Set initial model accuracy metrics
    for model_type in model_manager.models:
        MODEL_ACCURACY.labels(model_type=model_type).set(0.85)  # Default value
    
    logger.info("ML Service ready")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8001")),
        reload=os.getenv("ENVIRONMENT") == "development",
        workers=int(os.getenv("WORKERS", "4"))
    )