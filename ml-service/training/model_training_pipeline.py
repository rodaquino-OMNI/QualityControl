#!/usr/bin/env python3
"""
Model Training Pipeline for QualityControl Healthcare Platform
Automated training, validation, and deployment of ML models.
"""

import os
import logging
import json
import joblib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd
import mlflow
import mlflow.sklearn
import mlflow.pytorch
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.pipeline import Pipeline
import optuna
from sqlalchemy import create_engine
import asyncio
import redis
from prometheus_client import Counter, Histogram, Gauge

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Metrics
TRAINING_COUNTER = Counter('ml_training_jobs_total', 'Total training jobs', ['model_type', 'status'])
TRAINING_DURATION = Histogram('ml_training_duration_seconds', 'Training duration', ['model_type'])
MODEL_PERFORMANCE = Gauge('ml_model_performance', 'Model performance metrics', ['model_type', 'metric'])

class ModelTrainingPipeline:
    """Automated ML model training and deployment pipeline"""
    
    def __init__(self):
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://user:pass@localhost/qualitycontrol')
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.mlflow_uri = os.getenv('MLFLOW_TRACKING_URI', 'http://localhost:5000')
        self.model_store_path = os.getenv('MODEL_STORE_PATH', './models')
        
        # Initialize connections
        self.engine = create_engine(self.db_url)
        self.redis_client = redis.from_url(self.redis_url)
        mlflow.set_tracking_uri(self.mlflow_uri)
        
        # Training configurations
        self.model_configs = {
            'authorization': {
                'algorithm': 'random_forest',
                'target_column': 'decision',
                'feature_columns': self._get_authorization_features(),
                'metrics': ['accuracy', 'precision', 'recall', 'f1', 'auc'],
                'retraining_threshold': 0.02,  # Retrain if accuracy drops by 2%
                'min_accuracy': 0.85
            },
            'fraud_detection': {
                'algorithm': 'gradient_boosting',
                'target_column': 'is_fraud',
                'feature_columns': self._get_fraud_features(),
                'metrics': ['accuracy', 'precision', 'recall', 'f1', 'auc'],
                'retraining_threshold': 0.03,
                'min_accuracy': 0.90
            },
            'risk_assessment': {
                'algorithm': 'multi_output_regression',
                'target_columns': ['clinical_risk', 'financial_risk', 'compliance_risk'],
                'feature_columns': self._get_risk_features(),
                'metrics': ['mse', 'r2'],
                'retraining_threshold': 0.05,
                'min_performance': 0.80
            },
            'cost_prediction': {
                'algorithm': 'gradient_boosting_regressor',
                'target_column': 'actual_cost',
                'feature_columns': self._get_cost_features(),
                'metrics': ['mse', 'mae', 'r2'],
                'retraining_threshold': 0.10,
                'min_performance': 0.75
            }
        }
    
    def _get_authorization_features(self) -> List[str]:
        """Get feature list for authorization model"""
        return [
            # Patient features
            'patient_age_group', 'patient_gender_encoded', 'patient_risk_category_score',
            'patient_chronic_condition_count', 'patient_chronic_condition_complexity',
            'patient_authorization_history_count', 'patient_avg_authorization_value',
            'patient_approval_rate', 'patient_recent_activity_frequency',
            'patient_unusual_request_patterns', 'patient_provider_switching_frequency',
            
            # Provider features
            'provider_approval_rate', 'provider_avg_processing_time', 'provider_quality_score',
            'provider_compliance_score', 'provider_request_volume_percentile',
            'provider_request_value_percentile', 'provider_specialty_focus_score',
            'provider_fraud_incident_rate', 'provider_anomaly_score',
            
            # Procedure features
            'procedure_complexity_score', 'procedure_requires_preauth',
            'procedure_category_encoded', 'procedure_frequency', 'procedure_avg_market_value',
            'procedure_value_percentile', 'procedure_risk_level', 'procedure_complication_rate',
            
            # Temporal features
            'day_of_week', 'month_of_year', 'hour_of_day', 'is_weekend', 'is_holiday',
            'seasonality_score', 'trend_score', 'time_to_deadline',
            'urgency_level_normalized', 'processing_time_remaining',
            
            # Contextual features
            'current_system_load', 'reviewer_availability', 'monthly_budget_utilization',
            'cost_pressure_indicator', 'recent_policy_changes', 'compliance_risk_level',
            'document_quality_score', 'justification_clarity', 'supporting_evidence_score'
        ]
    
    def _get_fraud_features(self) -> List[str]:
        """Get feature list for fraud detection model"""
        return [
            # Core features for fraud detection
            'provider_anomaly_score', 'patient_unusual_request_patterns',
            'procedure_value_percentile', 'provider_fraud_incident_rate',
            'billing_pattern_anomaly', 'network_analysis_score',
            'time_pattern_anomaly', 'duplicate_request_score',
            'cross_provider_validation_score', 'claim_timing_anomaly'
        ] + self._get_authorization_features()  # Include all authorization features
    
    def _get_risk_features(self) -> List[str]:
        """Get feature list for risk assessment model"""
        return self._get_authorization_features() + [
            # Additional risk-specific features
            'historical_complication_rate', 'patient_adherence_score',
            'provider_safety_record', 'procedure_innovation_level',
            'regulatory_compliance_history', 'insurance_coverage_adequacy'
        ]
    
    def _get_cost_features(self) -> List[str]:
        """Get feature list for cost prediction model"""
        return self._get_authorization_features() + [
            # Cost-specific features
            'regional_cost_factors', 'facility_efficiency_score',
            'equipment_availability', 'staffing_levels',
            'market_competition_index', 'payer_negotiation_strength'
        ]
    
    async def train_model(self, model_type: str, force_retrain: bool = False) -> Dict[str, Any]:
        """Train a specific model type"""
        start_time = datetime.now()
        
        try:
            with TRAINING_DURATION.labels(model_type=model_type).time():
                logger.info(f"Starting training for {model_type} model")
                
                # Check if retraining is needed
                if not force_retrain and not await self._should_retrain(model_type):
                    logger.info(f"Retraining not needed for {model_type}")
                    return {'status': 'skipped', 'reason': 'Performance within acceptable range'}
                
                # Load and prepare data
                train_data, val_data = await self._load_training_data(model_type)
                if train_data.empty:
                    raise ValueError(f"No training data available for {model_type}")
                
                # Preprocess data
                X_train, y_train, X_val, y_val, preprocessor = self._preprocess_data(
                    train_data, val_data, model_type
                )
                
                # Hyperparameter optimization
                best_params = await self._optimize_hyperparameters(
                    X_train, y_train, model_type
                )
                
                # Train final model
                model = await self._train_final_model(
                    X_train, y_train, model_type, best_params, preprocessor
                )
                
                # Validate model
                validation_results = await self._validate_model(
                    model, X_val, y_val, model_type
                )
                
                # Deploy model if validation passes
                if self._validation_passes(validation_results, model_type):
                    deployment_result = await self._deploy_model(
                        model, model_type, validation_results, preprocessor
                    )
                    
                    TRAINING_COUNTER.labels(model_type=model_type, status='success').inc()
                    
                    # Update performance metrics
                    for metric_name, metric_value in validation_results.items():
                        MODEL_PERFORMANCE.labels(
                            model_type=model_type, 
                            metric=metric_name
                        ).set(metric_value)
                    
                    duration = (datetime.now() - start_time).total_seconds()
                    
                    return {
                        'status': 'success',
                        'model_type': model_type,
                        'validation_results': validation_results,
                        'deployment_result': deployment_result,
                        'training_duration': duration,
                        'data_size': len(train_data)
                    }
                else:
                    TRAINING_COUNTER.labels(model_type=model_type, status='failed').inc()
                    return {
                        'status': 'failed',
                        'reason': 'Validation failed',
                        'validation_results': validation_results
                    }
                    
        except Exception as e:
            TRAINING_COUNTER.labels(model_type=model_type, status='error').inc()
            logger.error(f"Training failed for {model_type}: {e}")
            return {
                'status': 'error',
                'error': str(e),
                'model_type': model_type
            }
    
    async def _should_retrain(self, model_type: str) -> bool:
        """Check if model should be retrained based on performance metrics"""
        try:
            # Get current model performance from monitoring
            current_performance = await self._get_current_performance(model_type)
            baseline_performance = await self._get_baseline_performance(model_type)
            
            config = self.model_configs[model_type]
            threshold = config['retraining_threshold']
            
            if baseline_performance is None:
                return True  # No baseline, retrain
            
            # Check if performance has degraded
            performance_drop = baseline_performance - current_performance
            
            if performance_drop > threshold:
                logger.info(f"Performance drop detected for {model_type}: {performance_drop}")
                return True
            
            # Check data drift
            drift_detected = await self._check_data_drift(model_type)
            if drift_detected:
                logger.info(f"Data drift detected for {model_type}")
                return True
            
            # Check if enough time has passed for scheduled retraining
            last_training = await self._get_last_training_time(model_type)
            if last_training and (datetime.now() - last_training).days > 30:
                logger.info(f"Scheduled retraining for {model_type}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error checking retrain condition for {model_type}: {e}")
            return True  # Default to retraining on error
    
    async def _load_training_data(self, model_type: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Load training and validation data"""
        config = self.model_configs[model_type]
        
        # Build SQL query based on model type
        if model_type == 'authorization':
            query = """
            SELECT ar.*, p.*, pr.*, org.*,
                   ad.decision as target,
                   EXTRACT(DOW FROM ar.submitted_at) as day_of_week,
                   EXTRACT(MONTH FROM ar.submitted_at) as month_of_year,
                   EXTRACT(HOUR FROM ar.submitted_at) as hour_of_day
            FROM medical.authorization_requests ar
            JOIN medical.patients p ON ar.patient_id = p.id
            JOIN medical.procedures pr ON ar.procedure_id = pr.id
            JOIN auth.organizations org ON ar.requesting_provider_id = org.id
            LEFT JOIN medical.authorization_decisions ad ON ar.id = ad.authorization_request_id
            WHERE ar.submitted_at >= NOW() - INTERVAL '2 years'
              AND ad.decision IS NOT NULL
            ORDER BY ar.submitted_at DESC
            """
        elif model_type == 'fraud_detection':
            query = """
            SELECT ar.*, p.*, pr.*, org.*,
                   CASE WHEN fd.status = 'confirmed' THEN 1 ELSE 0 END as is_fraud
            FROM medical.authorization_requests ar
            JOIN medical.patients p ON ar.patient_id = p.id
            JOIN medical.procedures pr ON ar.procedure_id = pr.id
            JOIN auth.organizations org ON ar.requesting_provider_id = org.id
            LEFT JOIN ai.fraud_detections fd ON ar.id = fd.entity_id AND fd.entity_type = 'authorization'
            WHERE ar.submitted_at >= NOW() - INTERVAL '18 months'
            ORDER BY ar.submitted_at DESC
            """
        # Add more queries for other model types...
        
        # Load data
        df = pd.read_sql(query, self.engine)
        
        # Split into train/validation
        cutoff_date = datetime.now() - timedelta(days=90)  # Last 3 months for validation
        train_data = df[pd.to_datetime(df['submitted_at']) < cutoff_date]
        val_data = df[pd.to_datetime(df['submitted_at']) >= cutoff_date]
        
        logger.info(f"Loaded {len(train_data)} training and {len(val_data)} validation samples for {model_type}")
        
        return train_data, val_data
    
    def _preprocess_data(self, train_data: pd.DataFrame, val_data: pd.DataFrame, 
                        model_type: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, Pipeline]:
        """Preprocess training and validation data"""
        config = self.model_configs[model_type]
        
        # Create feature engineering pipeline
        preprocessor = Pipeline([
            ('scaler', StandardScaler()),
            # Add more preprocessing steps as needed
        ])
        
        # Extract features and targets
        feature_columns = config['feature_columns']
        
        # Handle missing features gracefully
        available_features = [col for col in feature_columns if col in train_data.columns]
        missing_features = [col for col in feature_columns if col not in train_data.columns]
        
        if missing_features:
            logger.warning(f"Missing features for {model_type}: {missing_features}")
        
        X_train = train_data[available_features].fillna(0)
        X_val = val_data[available_features].fillna(0)
        
        if model_type in ['authorization', 'fraud_detection']:
            target_col = config['target_column']
            y_train = train_data[target_col]
            y_val = val_data[target_col]
            
            # Encode labels if necessary
            if y_train.dtype == 'object':
                label_encoder = LabelEncoder()
                y_train = label_encoder.fit_transform(y_train)
                y_val = label_encoder.transform(y_val)
        else:
            # Multi-target regression
            target_cols = config['target_columns']
            y_train = train_data[target_cols].fillna(0)
            y_val = val_data[target_cols].fillna(0)
        
        # Fit preprocessor on training data
        X_train_processed = preprocessor.fit_transform(X_train)
        X_val_processed = preprocessor.transform(X_val)
        
        return X_train_processed, y_train, X_val_processed, y_val, preprocessor
    
    async def _optimize_hyperparameters(self, X_train: np.ndarray, y_train: np.ndarray, 
                                       model_type: str) -> Dict[str, Any]:
        """Optimize hyperparameters using Optuna"""
        config = self.model_configs[model_type]
        algorithm = config['algorithm']
        
        def objective(trial):
            if algorithm == 'random_forest':
                params = {
                    'n_estimators': trial.suggest_int('n_estimators', 50, 300),
                    'max_depth': trial.suggest_int('max_depth', 3, 20),
                    'min_samples_split': trial.suggest_int('min_samples_split', 2, 20),
                    'min_samples_leaf': trial.suggest_int('min_samples_leaf', 1, 10),
                    'random_state': 42
                }
                model = RandomForestClassifier(**params)
            elif algorithm == 'gradient_boosting':
                params = {
                    'n_estimators': trial.suggest_int('n_estimators', 50, 200),
                    'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3),
                    'max_depth': trial.suggest_int('max_depth', 3, 10),
                    'random_state': 42
                }
                model = GradientBoostingRegressor(**params)
            else:
                # Default to logistic regression
                params = {
                    'C': trial.suggest_float('C', 0.1, 10.0),
                    'random_state': 42
                }
                model = LogisticRegression(**params)
            
            # Cross-validation score
            cv_scores = cross_val_score(model, X_train, y_train, cv=5, 
                                      scoring='accuracy' if model_type in ['authorization', 'fraud_detection'] else 'r2')
            return cv_scores.mean()
        
        study = optuna.create_study(direction='maximize')
        study.optimize(objective, n_trials=50)
        
        logger.info(f"Best parameters for {model_type}: {study.best_params}")
        return study.best_params
    
    async def _train_final_model(self, X_train: np.ndarray, y_train: np.ndarray,
                               model_type: str, best_params: Dict[str, Any],
                               preprocessor: Pipeline) -> Pipeline:
        """Train final model with best parameters"""
        config = self.model_configs[model_type]
        algorithm = config['algorithm']
        
        # Create model with best parameters
        if algorithm == 'random_forest':
            model = RandomForestClassifier(**best_params)
        elif algorithm == 'gradient_boosting':
            if model_type in ['authorization', 'fraud_detection']:
                from sklearn.ensemble import GradientBoostingClassifier
                model = GradientBoostingClassifier(**best_params)
            else:
                model = GradientBoostingRegressor(**best_params)
        else:
            model = LogisticRegression(**best_params)
        
        # Create pipeline with preprocessor and model
        pipeline = Pipeline([
            ('preprocessor', preprocessor),
            ('model', model)
        ])
        
        # Train model
        pipeline.fit(X_train, y_train)
        
        logger.info(f"Trained {model_type} model with algorithm {algorithm}")
        return pipeline
    
    async def _validate_model(self, model: Pipeline, X_val: np.ndarray, 
                            y_val: np.ndarray, model_type: str) -> Dict[str, float]:
        """Validate trained model"""
        config = self.model_configs[model_type]
        
        # Make predictions
        if model_type in ['authorization', 'fraud_detection']:
            y_pred = model.predict(X_val)
            y_pred_proba = model.predict_proba(X_val)[:, 1] if hasattr(model, 'predict_proba') else None
            
            results = {
                'accuracy': accuracy_score(y_val, y_pred),
                'precision': precision_score(y_val, y_pred, average='weighted'),
                'recall': recall_score(y_val, y_pred, average='weighted'),
                'f1': f1_score(y_val, y_pred, average='weighted')
            }
            
            if y_pred_proba is not None:
                results['auc'] = roc_auc_score(y_val, y_pred_proba)
        else:
            # Regression metrics
            y_pred = model.predict(X_val)
            from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
            
            results = {
                'mse': mean_squared_error(y_val, y_pred),
                'mae': mean_absolute_error(y_val, y_pred),
                'r2': r2_score(y_val, y_pred)
            }
        
        logger.info(f"Validation results for {model_type}: {results}")
        return results
    
    def _validation_passes(self, validation_results: Dict[str, float], model_type: str) -> bool:
        """Check if validation results meet minimum requirements"""
        config = self.model_configs[model_type]
        
        if model_type in ['authorization', 'fraud_detection']:
            min_accuracy = config['min_accuracy']
            return validation_results.get('accuracy', 0) >= min_accuracy
        else:
            min_performance = config['min_performance']
            return validation_results.get('r2', 0) >= min_performance
    
    async def _deploy_model(self, model: Pipeline, model_type: str, 
                          validation_results: Dict[str, float],
                          preprocessor: Pipeline) -> Dict[str, Any]:
        """Deploy validated model"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        model_version = f"{model_type}_v{timestamp}"
        
        # Save model locally
        model_path = os.path.join(self.model_store_path, f"{model_version}.pkl")
        os.makedirs(self.model_store_path, exist_ok=True)
        joblib.dump(model, model_path)
        
        # Save metadata
        metadata = {
            'model_type': model_type,
            'version': model_version,
            'validation_results': validation_results,
            'feature_names': self.model_configs[model_type]['feature_columns'],
            'created_at': datetime.now().isoformat(),
            'model_path': model_path
        }
        
        metadata_path = model_path.replace('.pkl', '_metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        # Log to MLflow
        with mlflow.start_run(run_name=f"{model_type}_training_{timestamp}"):
            mlflow.log_params(model.named_steps['model'].get_params())
            mlflow.log_metrics(validation_results)
            mlflow.sklearn.log_model(model, model_type)
            mlflow.log_artifacts(self.model_store_path)
        
        # Update database
        await self._update_model_registry(model_type, model_version, validation_results)
        
        # Notify deployment service
        await self._notify_deployment(model_type, model_version, model_path)
        
        logger.info(f"Successfully deployed {model_type} model version {model_version}")
        
        return {
            'model_version': model_version,
            'model_path': model_path,
            'metadata_path': metadata_path,
            'mlflow_run_id': mlflow.active_run().info.run_id if mlflow.active_run() else None
        }
    
    async def _get_current_performance(self, model_type: str) -> Optional[float]:
        """Get current model performance from monitoring data"""
        # This would integrate with your monitoring system
        # For now, return a mock value
        return 0.88
    
    async def _get_baseline_performance(self, model_type: str) -> Optional[float]:
        """Get baseline model performance"""
        # Query from model registry
        return 0.90
    
    async def _check_data_drift(self, model_type: str) -> bool:
        """Check for data drift using statistical tests"""
        # Implement data drift detection using methods like:
        # - KL divergence
        # - Population Stability Index (PSI)
        # - Kolmogorov-Smirnov test
        return False  # Placeholder
    
    async def _get_last_training_time(self, model_type: str) -> Optional[datetime]:
        """Get last training time for model"""
        # Query from model registry
        return datetime.now() - timedelta(days=15)  # Placeholder
    
    async def _update_model_registry(self, model_type: str, model_version: str, 
                                   validation_results: Dict[str, float]):
        """Update model registry in database"""
        # This would update the AIModel table in your database
        pass
    
    async def _notify_deployment(self, model_type: str, model_version: str, model_path: str):
        """Notify deployment service of new model"""
        notification = {
            'model_type': model_type,
            'model_version': model_version,
            'model_path': model_path,
            'timestamp': datetime.now().isoformat(),
            'action': 'deploy'
        }
        
        # Send to Redis queue for deployment service
        self.redis_client.lpush('model_deployment_queue', json.dumps(notification))
        
        logger.info(f"Sent deployment notification for {model_type}")

# Training scheduler
class TrainingScheduler:
    """Manages scheduled model training"""
    
    def __init__(self):
        self.pipeline = ModelTrainingPipeline()
        self.redis_client = redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379'))
    
    async def run_scheduled_training(self):
        """Run scheduled training for all models"""
        model_types = ['authorization', 'fraud_detection', 'risk_assessment', 'cost_prediction']
        
        for model_type in model_types:
            try:
                result = await self.pipeline.train_model(model_type)
                logger.info(f"Scheduled training result for {model_type}: {result}")
                
                # Store result
                self.redis_client.setex(
                    f"training_result:{model_type}",
                    86400,  # 24 hours
                    json.dumps(result)
                )
                
            except Exception as e:
                logger.error(f"Scheduled training failed for {model_type}: {e}")
    
    async def process_training_queue(self):
        """Process training requests from queue"""
        while True:
            try:
                # Check for training requests
                request = self.redis_client.brpop('training_queue', timeout=10)
                if request:
                    request_data = json.loads(request[1])
                    model_type = request_data['model_type']
                    force_retrain = request_data.get('force_retrain', False)
                    
                    logger.info(f"Processing training request for {model_type}")
                    result = await self.pipeline.train_model(model_type, force_retrain)
                    
                    # Store result
                    self.redis_client.setex(
                        f"training_result:{model_type}",
                        86400,
                        json.dumps(result)
                    )
                    
            except Exception as e:
                logger.error(f"Error processing training queue: {e}")
                await asyncio.sleep(5)

if __name__ == "__main__":
    # Example usage
    async def main():
        scheduler = TrainingScheduler()
        
        # Run one-time training
        # await scheduler.run_scheduled_training()
        
        # Or process queue continuously
        await scheduler.process_training_queue()
    
    asyncio.run(main())