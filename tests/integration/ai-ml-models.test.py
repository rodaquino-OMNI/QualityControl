"""
AI Service ↔ ML Model Serving Integration Tests
Tests the integration between AI service and various ML models
"""

import pytest
import asyncio
import numpy as np
import pandas as pd
from httpx import AsyncClient
from unittest.mock import patch, Mock, AsyncMock
import torch
import json
import time
from datetime import datetime, timedelta

from app.models.bert_medical import BertMedicalModel
from app.models.xgboost_fraud import XGBoostFraudModel
from app.models.lstm_patterns import LSTMPatternModel
from app.models.decision_pipeline import DecisionPipeline
from app.services.model_manager import ModelManager
from tests.fixtures.model_fixtures import ModelTestFixtures


class TestBertMedicalModelIntegration:
    """Test BERT medical model integration."""
    
    @pytest.mark.asyncio
    async def test_bert_medical_analysis_flow(
        self, 
        client: AsyncClient, 
        auth_headers: dict,
        model_fixtures: ModelTestFixtures
    ):
        """Test complete BERT medical analysis flow."""
        # Prepare test data
        clinical_text = """
        Patient: John Doe, 65-year-old male
        Chief Complaint: Chest pain and shortness of breath
        History: Hypertension, Type 2 Diabetes Mellitus
        Medications: Metformin 1000mg BID, Lisinopril 10mg daily
        Physical Exam: BP 160/95, HR 88, O2 Sat 94%
        Assessment: Possible acute coronary syndrome
        Plan: EKG, cardiac enzymes, chest X-ray
        """
        
        # Mock BERT model responses
        with patch('app.models.bert_medical.BertMedicalModel') as mock_bert:
            mock_instance = AsyncMock()
            mock_instance.extract_entities.return_value = {
                'entities': {
                    'patient_demographics': {
                        'age': '65',
                        'gender': 'male',
                        'name': 'John Doe'
                    },
                    'conditions': [
                        {'text': 'Hypertension', 'confidence': 0.95, 'icd10': 'I10'},
                        {'text': 'Type 2 Diabetes Mellitus', 'confidence': 0.92, 'icd10': 'E11.9'}
                    ],
                    'medications': [
                        {'name': 'Metformin', 'dosage': '1000mg', 'frequency': 'BID', 'confidence': 0.98},
                        {'name': 'Lisinopril', 'dosage': '10mg', 'frequency': 'daily', 'confidence': 0.96}
                    ],
                    'vital_signs': {
                        'blood_pressure': '160/95',
                        'heart_rate': '88',
                        'oxygen_saturation': '94%'
                    },
                    'procedures': [
                        {'name': 'EKG', 'confidence': 0.89},
                        {'name': 'cardiac enzymes', 'confidence': 0.87},
                        {'name': 'chest X-ray', 'confidence': 0.91}
                    ]
                },
                'confidence_score': 0.93,
                'processing_time': 2.3
            }
            
            mock_instance.classify_severity.return_value = {
                'severity_level': 'moderate',
                'urgency_score': 0.75,
                'risk_factors': ['chest_pain', 'shortness_of_breath', 'hypertension', 'diabetes'],
                'recommended_actions': ['immediate_evaluation', 'cardiac_workup']
            }
            
            mock_bert.return_value = mock_instance
            
            # Test entity extraction
            response = await client.post(
                "/api/v1/ml/bert/extract-entities",
                headers=auth_headers,
                json={
                    "text": clinical_text,
                    "entity_types": ["conditions", "medications", "vital_signs", "procedures"],
                    "include_confidence": True
                }
            )
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify entity extraction results
            assert 'entities' in data
            assert len(data['entities']['conditions']) == 2
            assert len(data['entities']['medications']) == 2
            assert data['entities']['patient_demographics']['age'] == '65'
            assert data['confidence_score'] == 0.93
            
            # Test severity classification
            severity_response = await client.post(
                "/api/v1/ml/bert/classify-severity",
                headers=auth_headers,
                json={
                    "clinical_text": clinical_text,
                    "patient_history": {
                        "conditions": ["hypertension", "diabetes"],
                        "age": 65,
                        "medications": ["metformin", "lisinopril"]
                    }
                }
            )
            
            assert severity_response.status_code == 200
            severity_data = severity_response.json()
            
            assert severity_data['severity_level'] == 'moderate'
            assert severity_data['urgency_score'] == 0.75
            assert 'chest_pain' in severity_data['risk_factors']
    
    @pytest.mark.asyncio
    async def test_bert_model_performance_metrics(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test BERT model performance monitoring."""
        # Test model performance endpoint
        response = await client.get(
            "/api/v1/ml/bert/performance",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify performance metrics
        assert 'model_info' in data
        assert 'performance_metrics' in data
        assert 'throughput' in data
        
        expected_metrics = ['accuracy', 'precision', 'recall', 'f1_score']
        for metric in expected_metrics:
            assert metric in data['performance_metrics']
            assert 0 <= data['performance_metrics'][metric] <= 1
        
        # Test model warm-up
        warmup_response = await client.post(
            "/api/v1/ml/bert/warmup",
            headers=auth_headers,
            json={"num_samples": 10}
        )
        
        assert warmup_response.status_code == 200
        warmup_data = warmup_response.json()
        assert warmup_data['status'] == 'completed'
        assert 'warmup_time' in warmup_data


class TestXGBoostFraudModelIntegration:
    """Test XGBoost fraud detection model integration."""
    
    @pytest.mark.asyncio
    async def test_fraud_detection_flow(
        self, 
        client: AsyncClient, 
        auth_headers: dict,
        model_fixtures: ModelTestFixtures
    ):
        """Test complete fraud detection flow."""
        # Prepare fraud detection test data
        claim_data = {
            "claim_id": "CLM-001",
            "provider_id": "PROV-123",
            "patient_id": "PAT-456",
            "claim_amount": 15000.00,
            "procedure_codes": ["99213", "93000", "80053"],
            "diagnosis_codes": ["I10", "E11.9"],
            "service_date": "2024-01-15",
            "provider_specialty": "cardiology",
            "patient_age": 65,
            "claim_features": {
                "num_procedures": 3,
                "total_amount": 15000.00,
                "days_since_last_claim": 7,
                "provider_claim_frequency": 45,
                "unusual_hour_flag": False,
                "weekend_flag": False,
                "high_cost_flag": True
            }
        }
        
        with patch('app.models.xgboost_fraud.XGBoostFraudModel') as mock_xgb:
            mock_instance = AsyncMock()
            mock_instance.predict_fraud.return_value = {
                'fraud_probability': 0.82,
                'risk_level': 'high',
                'confidence': 0.89,
                'feature_importance': {
                    'claim_amount': 0.35,
                    'provider_claim_frequency': 0.28,
                    'days_since_last_claim': 0.18,
                    'high_cost_flag': 0.12,
                    'num_procedures': 0.07
                },
                'risk_factors': [
                    'High claim amount relative to typical',
                    'Short interval between claims',
                    'Provider has high claim frequency'
                ],
                'similar_fraud_cases': [
                    {'case_id': 'FRAUD-001', 'similarity': 0.89},
                    {'case_id': 'FRAUD-002', 'similarity': 0.76}
                ]
            }
            
            mock_xgb.return_value = mock_instance
            
            # Test fraud prediction
            response = await client.post(
                "/api/v1/ml/xgboost/predict-fraud",
                headers=auth_headers,
                json=claim_data
            )
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify fraud prediction results
            assert data['fraud_probability'] == 0.82
            assert data['risk_level'] == 'high'
            assert data['confidence'] == 0.89
            assert len(data['risk_factors']) == 3
            assert 'feature_importance' in data
            
            # Verify feature importance
            importance_sum = sum(data['feature_importance'].values())
            assert abs(importance_sum - 1.0) < 0.01  # Should sum to ~1.0
    
    @pytest.mark.asyncio
    async def test_batch_fraud_detection(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test batch fraud detection processing."""
        # Prepare batch of claims
        batch_claims = [
            {
                "claim_id": f"CLM-{i:03d}",
                "claim_amount": 1000 + (i * 500),
                "provider_id": f"PROV-{i % 3}",
                "procedure_codes": ["99213"],
                "claim_features": {
                    "num_procedures": 1,
                    "total_amount": 1000 + (i * 500),
                    "days_since_last_claim": i * 2,
                    "provider_claim_frequency": 20 + i,
                    "high_cost_flag": (1000 + (i * 500)) > 5000
                }
            }
            for i in range(10)
        ]
        
        with patch('app.models.xgboost_fraud.XGBoostFraudModel') as mock_xgb:
            mock_instance = AsyncMock()
            mock_instance.batch_predict.return_value = [
                {
                    'claim_id': claim['claim_id'],
                    'fraud_probability': 0.3 + (i * 0.05),
                    'risk_level': 'low' if i < 5 else 'medium' if i < 8 else 'high',
                    'processing_time': 0.1 + (i * 0.01)
                }
                for i, claim in enumerate(batch_claims)
            ]
            
            mock_xgb.return_value = mock_instance
            
            # Test batch prediction
            response = await client.post(
                "/api/v1/ml/xgboost/batch-predict",
                headers=auth_headers,
                json={
                    "claims": batch_claims,
                    "threshold": 0.7,
                    "include_explanations": True
                }
            )
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify batch results
            assert len(data['results']) == 10
            assert data['summary']['total_processed'] == 10
            assert data['summary']['high_risk_count'] >= 0
            
            # Check individual predictions
            for i, result in enumerate(data['results']):
                assert result['claim_id'] == f"CLM-{i:03d}"
                assert 0 <= result['fraud_probability'] <= 1
                assert result['risk_level'] in ['low', 'medium', 'high']


class TestLSTMPatternModelIntegration:
    """Test LSTM pattern detection model integration."""
    
    @pytest.mark.asyncio
    async def test_temporal_pattern_detection(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test temporal pattern detection using LSTM."""
        # Generate time series data
        time_series_data = {
            "patient_id": "PAT-001",
            "data_type": "vital_signs",
            "time_series": [
                {
                    "timestamp": (datetime.now() - timedelta(days=i)).isoformat(),
                    "heart_rate": 70 + np.sin(i * 0.1) * 10 + np.random.normal(0, 2),
                    "blood_pressure_systolic": 120 + np.sin(i * 0.05) * 15 + np.random.normal(0, 3),
                    "blood_pressure_diastolic": 80 + np.sin(i * 0.05) * 10 + np.random.normal(0, 2),
                    "temperature": 98.6 + np.random.normal(0, 0.5)
                }
                for i in range(30)
            ],
            "analysis_window": 7,
            "prediction_horizon": 3
        }
        
        with patch('app.models.lstm_patterns.LSTMPatternModel') as mock_lstm:
            mock_instance = AsyncMock()
            mock_instance.detect_patterns.return_value = {
                'patterns_detected': [
                    {
                        'pattern_type': 'trending_increase',
                        'parameter': 'blood_pressure_systolic',
                        'confidence': 0.87,
                        'start_date': (datetime.now() - timedelta(days=10)).isoformat(),
                        'end_date': datetime.now().isoformat(),
                        'severity': 'moderate'
                    },
                    {
                        'pattern_type': 'irregular_rhythm',
                        'parameter': 'heart_rate',
                        'confidence': 0.72,
                        'anomaly_score': 0.65,
                        'severity': 'low'
                    }
                ],
                'predictions': [
                    {
                        'timestamp': (datetime.now() + timedelta(days=1)).isoformat(),
                        'predicted_values': {
                            'heart_rate': 75.2,
                            'blood_pressure_systolic': 135.8,
                            'blood_pressure_diastolic': 85.3
                        },
                        'confidence_intervals': {
                            'heart_rate': [70.1, 80.3],
                            'blood_pressure_systolic': [128.5, 143.1],
                            'blood_pressure_diastolic': [80.1, 90.5]
                        }
                    }
                ],
                'risk_assessment': {
                    'overall_risk': 'moderate',
                    'risk_factors': ['increasing_bp_trend', 'irregular_heart_rate'],
                    'recommended_actions': ['monitor_blood_pressure', 'cardiology_consultation']
                }
            }
            
            mock_lstm.return_value = mock_instance
            
            # Test pattern detection
            response = await client.post(
                "/api/v1/ml/lstm/detect-patterns",
                headers=auth_headers,
                json=time_series_data
            )
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify pattern detection results
            assert len(data['patterns_detected']) == 2
            assert data['patterns_detected'][0]['pattern_type'] == 'trending_increase'
            assert data['patterns_detected'][0]['confidence'] == 0.87
            
            # Verify predictions
            assert len(data['predictions']) == 1
            assert 'predicted_values' in data['predictions'][0]
            assert 'confidence_intervals' in data['predictions'][0]
            
            # Verify risk assessment
            assert data['risk_assessment']['overall_risk'] == 'moderate'
            assert len(data['risk_assessment']['risk_factors']) == 2
    
    @pytest.mark.asyncio
    async def test_lstm_model_training_status(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test LSTM model training and status monitoring."""
        # Test model training status
        response = await client.get(
            "/api/v1/ml/lstm/training-status",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify training status information
        assert 'model_version' in data
        assert 'training_status' in data
        assert 'last_trained' in data
        assert 'performance_metrics' in data
        
        # Test model retraining trigger
        retrain_response = await client.post(
            "/api/v1/ml/lstm/retrain",
            headers=auth_headers,
            json={
                "training_data_source": "recent_patterns",
                "validation_split": 0.2,
                "epochs": 50,
                "batch_size": 32
            }
        )
        
        assert retrain_response.status_code == 202
        retrain_data = retrain_response.json()
        assert 'training_job_id' in retrain_data
        assert retrain_data['status'] == 'started'


class TestModelPipelineIntegration:
    """Test integrated model pipeline operations."""
    
    @pytest.mark.asyncio
    async def test_decision_pipeline_flow(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test complete decision pipeline with multiple models."""
        # Complex case requiring multiple models
        complex_case = {
            "case_id": "COMPLEX-001",
            "patient_data": {
                "age": 68,
                "gender": "female",
                "medical_history": ["hypertension", "diabetes", "heart_disease"],
                "current_medications": ["metformin", "lisinopril", "atorvastatin"]
            },
            "clinical_notes": """
            Patient reports chest pain radiating to left arm.
            EKG shows ST elevation in leads II, III, aVF.
            Troponin levels elevated at 15.2 ng/mL.
            Patient appears diaphoretic and anxious.
            """,
            "claims_data": {
                "recent_claims": [
                    {"amount": 25000, "procedure": "cardiac_catheterization", "date": "2024-01-10"},
                    {"amount": 5000, "procedure": "emergency_visit", "date": "2024-01-15"}
                ],
                "provider_history": {
                    "specialty": "cardiology",
                    "claim_frequency": 120,
                    "average_claim_value": 8500
                }
            },
            "vital_signs_history": [
                {
                    "timestamp": "2024-01-15T08:00:00Z",
                    "blood_pressure": "180/110",
                    "heart_rate": 105,
                    "oxygen_saturation": 92
                },
                {
                    "timestamp": "2024-01-15T09:00:00Z",
                    "blood_pressure": "175/108",
                    "heart_rate": 108,
                    "oxygen_saturation": 90
                }
            ]
        }
        
        with patch('app.models.decision_pipeline.DecisionPipeline') as mock_pipeline:
            mock_instance = AsyncMock()
            mock_instance.process_case.return_value = {
                'case_id': 'COMPLEX-001',
                'overall_risk_score': 0.89,
                'confidence': 0.92,
                'model_results': {
                    'bert_analysis': {
                        'medical_entities': {
                            'conditions': ['chest_pain', 'st_elevation', 'elevated_troponin'],
                            'severity': 'critical',
                            'urgency_score': 0.95
                        }
                    },
                    'fraud_detection': {
                        'fraud_probability': 0.15,
                        'risk_level': 'low',
                        'explanation': 'Claims consistent with emergency cardiac care'
                    },
                    'pattern_analysis': {
                        'vital_signs_trend': 'deteriorating',
                        'predicted_outcome': 'requires_immediate_intervention',
                        'confidence': 0.88
                    }
                },
                'recommendations': [
                    {
                        'action': 'immediate_medical_attention',
                        'priority': 'critical',
                        'rationale': 'Signs consistent with acute MI'
                    },
                    {
                        'action': 'monitor_vitals_continuously',
                        'priority': 'high',
                        'rationale': 'Deteriorating vital signs pattern'
                    },
                    {
                        'action': 'approve_emergency_claims',
                        'priority': 'medium',
                        'rationale': 'Low fraud risk, legitimate emergency'
                    }
                ],
                'processing_time': 3.2,
                'model_versions': {
                    'bert_medical': '1.2.3',
                    'xgboost_fraud': '2.1.0',
                    'lstm_patterns': '1.5.2'
                }
            }
            
            mock_pipeline.return_value = mock_instance
            
            # Test integrated pipeline
            response = await client.post(
                "/api/v1/ml/pipeline/process-case",
                headers=auth_headers,
                json=complex_case
            )
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify integrated results
            assert data['overall_risk_score'] == 0.89
            assert data['confidence'] == 0.92
            assert 'model_results' in data
            assert len(data['recommendations']) == 3
            
            # Verify each model contributed
            assert 'bert_analysis' in data['model_results']
            assert 'fraud_detection' in data['model_results']
            assert 'pattern_analysis' in data['model_results']
            
            # Verify critical case handling
            critical_recommendations = [
                r for r in data['recommendations'] 
                if r['priority'] == 'critical'
            ]
            assert len(critical_recommendations) == 1
            assert critical_recommendations[0]['action'] == 'immediate_medical_attention'
    
    @pytest.mark.asyncio
    async def test_model_ensemble_voting(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test ensemble model voting mechanism."""
        # Test case with conflicting model outputs
        conflicting_case = {
            "case_id": "CONFLICT-001",
            "patient_data": {"age": 45, "gender": "male"},
            "analysis_options": {
                "enable_ensemble_voting": True,
                "confidence_threshold": 0.8,
                "require_consensus": False
            }
        }
        
        with patch('app.models.decision_pipeline.DecisionPipeline') as mock_pipeline:
            mock_instance = AsyncMock()
            mock_instance.ensemble_predict.return_value = {
                'individual_predictions': {
                    'model_a': {'risk_score': 0.3, 'confidence': 0.85},
                    'model_b': {'risk_score': 0.7, 'confidence': 0.82},
                    'model_c': {'risk_score': 0.45, 'confidence': 0.79}
                },
                'ensemble_result': {
                    'weighted_risk_score': 0.48,
                    'consensus_confidence': 0.82,
                    'voting_method': 'weighted_average',
                    'agreement_level': 'moderate'
                },
                'model_weights': {
                    'model_a': 0.35,
                    'model_b': 0.40,
                    'model_c': 0.25
                },
                'recommendation': 'monitor_closely',
                'explanation': 'Models show moderate disagreement, weighted toward higher risk'
            }
            
            mock_pipeline.return_value = mock_instance
            
            # Test ensemble voting
            response = await client.post(
                "/api/v1/ml/pipeline/ensemble-predict",
                headers=auth_headers,
                json=conflicting_case
            )
            
            assert response.status_code == 200
            data = response.json()
            
            # Verify ensemble results
            assert 'individual_predictions' in data
            assert 'ensemble_result' in data
            assert data['ensemble_result']['weighted_risk_score'] == 0.48
            assert data['ensemble_result']['agreement_level'] == 'moderate'
            
            # Verify model weights sum to 1
            weights_sum = sum(data['model_weights'].values())
            assert abs(weights_sum - 1.0) < 0.01


class TestModelPerformanceMonitoring:
    """Test ML model performance monitoring and alerting."""
    
    @pytest.mark.asyncio
    async def test_model_drift_detection(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test model drift detection and alerting."""
        # Test drift detection endpoint
        response = await client.get(
            "/api/v1/ml/monitoring/drift-analysis",
            headers=auth_headers,
            params={
                "model_name": "bert_medical",
                "time_window": "7d",
                "baseline_period": "30d"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify drift analysis results
        assert 'drift_score' in data
        assert 'drift_detected' in data
        assert 'drift_metrics' in data
        assert 'baseline_comparison' in data
        
        if data['drift_detected']:
            assert data['drift_score'] > 0.05  # Threshold for drift detection
            assert 'recommendations' in data
            assert len(data['recommendations']) > 0
    
    @pytest.mark.asyncio
    async def test_model_performance_dashboard(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test model performance dashboard data."""
        response = await client.get(
            "/api/v1/ml/monitoring/dashboard",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify dashboard data structure
        assert 'models' in data
        assert 'system_metrics' in data
        assert 'alerts' in data
        
        # Verify model metrics
        for model_name, metrics in data['models'].items():
            assert 'accuracy' in metrics
            assert 'throughput' in metrics
            assert 'latency' in metrics
            assert 'error_rate' in metrics
            assert 'last_updated' in metrics
        
        # Verify system metrics
        system_metrics = data['system_metrics']
        assert 'cpu_usage' in system_metrics
        assert 'memory_usage' in system_metrics
        assert 'gpu_utilization' in system_metrics
        assert 'disk_usage' in system_metrics
    
    @pytest.mark.asyncio
    async def test_model_a_b_testing(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test A/B testing framework for model versions."""
        # Setup A/B test
        ab_test_config = {
            "test_name": "bert_medical_v1_vs_v2",
            "model_a": {
                "name": "bert_medical",
                "version": "1.2.3",
                "traffic_percentage": 50
            },
            "model_b": {
                "name": "bert_medical",
                "version": "1.3.0",
                "traffic_percentage": 50
            },
            "success_metrics": ["accuracy", "processing_time", "user_satisfaction"],
            "test_duration": "7d",
            "minimum_samples": 1000
        }
        
        # Create A/B test
        create_response = await client.post(
            "/api/v1/ml/ab-test/create",
            headers=auth_headers,
            json=ab_test_config
        )
        
        assert create_response.status_code == 201
        test_data = create_response.json()
        assert 'test_id' in test_data
        assert test_data['status'] == 'active'
        
        test_id = test_data['test_id']
        
        # Get A/B test results
        results_response = await client.get(
            f"/api/v1/ml/ab-test/{test_id}/results",
            headers=auth_headers
        )
        
        assert results_response.status_code == 200
        results_data = results_response.json()
        
        # Verify A/B test results structure
        assert 'test_summary' in results_data
        assert 'model_performance' in results_data
        assert 'statistical_significance' in results_data
        
        # Verify both models are being tested
        assert 'model_a' in results_data['model_performance']
        assert 'model_b' in results_data['model_performance']


class TestModelScalabilityAndLoad:
    """Test ML model scalability and load handling."""
    
    @pytest.mark.asyncio
    async def test_high_throughput_processing(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test high throughput model processing."""
        # Generate large batch of requests
        batch_size = 100
        requests = []
        
        for i in range(batch_size):
            request_data = {
                "text": f"Sample medical text {i} for processing",
                "patient_id": f"PAT-{i:03d}",
                "analysis_type": "quick"
            }
            requests.append(request_data)
        
        # Submit batch processing request
        start_time = time.time()
        response = await client.post(
            "/api/v1/ml/batch-process",
            headers=auth_headers,
            json={
                "requests": requests,
                "priority": "normal",
                "max_parallel": 10
            }
        )
        end_time = time.time()
        
        assert response.status_code == 202
        data = response.json()
        assert 'batch_id' in data
        assert data['total_requests'] == batch_size
        
        batch_id = data['batch_id']
        
        # Poll for completion
        completed = False
        max_attempts = 30
        attempt = 0
        
        while not completed and attempt < max_attempts:
            status_response = await client.get(
                f"/api/v1/ml/batch-process/{batch_id}/status",
                headers=auth_headers
            )
            
            assert status_response.status_code == 200
            status_data = status_response.json()
            
            if status_data['status'] == 'completed':
                completed = True
                assert status_data['processed'] == batch_size
                assert status_data['failed'] == 0
                
                # Verify processing time is reasonable
                total_time = end_time - start_time + status_data['processing_time']
                throughput = batch_size / total_time
                
                # Should process at least 10 requests per second
                assert throughput >= 10
                
                print(f"Processed {batch_size} requests in {total_time:.2f}s "
                      f"(throughput: {throughput:.1f} req/s)")
            else:
                await asyncio.sleep(1)
                attempt += 1
        
        assert completed, "Batch processing did not complete within expected time"
    
    @pytest.mark.asyncio
    async def test_model_auto_scaling(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test model auto-scaling based on load."""
        # Check current scaling status
        scaling_response = await client.get(
            "/api/v1/ml/scaling/status",
            headers=auth_headers
        )
        
        assert scaling_response.status_code == 200
        scaling_data = scaling_response.json()
        
        # Verify scaling information
        assert 'current_instances' in scaling_data
        assert 'target_instances' in scaling_data
        assert 'scaling_policy' in scaling_data
        assert 'load_metrics' in scaling_data
        
        # Test manual scaling trigger
        scale_up_response = await client.post(
            "/api/v1/ml/scaling/trigger",
            headers=auth_headers,
            json={
                "action": "scale_up",
                "reason": "load_test",
                "target_instances": scaling_data['current_instances'] + 2
            }
        )
        
        assert scale_up_response.status_code == 202
        scale_data = scale_up_response.json()
        assert scale_data['status'] == 'scaling_initiated'
    
    @pytest.mark.asyncio
    async def test_model_health_checks(
        self, 
        client: AsyncClient, 
        auth_headers: dict
    ):
        """Test comprehensive model health monitoring."""
        response = await client.get(
            "/api/v1/ml/health/comprehensive",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify comprehensive health check
        assert 'overall_status' in data
        assert 'model_status' in data
        assert 'resource_utilization' in data
        assert 'performance_metrics' in data
        assert 'alerts' in data
        
        # Each model should have health status
        for model_name, status in data['model_status'].items():
            assert 'status' in status
            assert status['status'] in ['healthy', 'degraded', 'unhealthy']
            assert 'last_prediction' in status
            assert 'error_rate' in status
            assert 'response_time' in status
        
        # Resource utilization should be within bounds
        resources = data['resource_utilization']
        assert 0 <= resources['cpu_usage'] <= 100
        assert 0 <= resources['memory_usage'] <= 100
        if 'gpu_usage' in resources:
            assert 0 <= resources['gpu_usage'] <= 100