#!/usr/bin/env python3
"""
Model Monitoring and Drift Detection for QualityControl Healthcare Platform
Real-time monitoring of ML model performance, data drift, and system health.
"""

import os
import logging
import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
import numpy as np
import pandas as pd
from scipy import stats
from evidently import ColumnMapping
from evidently.report import Report
from evidently.metric_preset import DataDriftPreset, TargetDriftPreset
from evidently.metrics import *
import redis
from sqlalchemy import create_engine, text
from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry, push_to_gateway
import asyncpg
import aioredis
from dataclasses import dataclass
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AlertLevel(Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"

@dataclass
class DriftAlert:
    model_type: str
    metric_name: str
    current_value: float
    baseline_value: float
    drift_score: float
    alert_level: AlertLevel
    timestamp: datetime
    details: Dict[str, Any]

@dataclass
class PerformanceAlert:
    model_type: str
    metric_name: str
    current_value: float
    threshold: float
    alert_level: AlertLevel
    timestamp: datetime
    details: Dict[str, Any]

class ModelMonitor:
    """Real-time model monitoring and alerting system"""
    
    def __init__(self):
        self.db_url = os.getenv('DATABASE_URL', 'postgresql://user:pass@localhost/qualitycontrol')
        self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        self.prometheus_gateway = os.getenv('PROMETHEUS_GATEWAY', 'localhost:9091')
        
        # Initialize connections
        self.engine = create_engine(self.db_url)
        self.redis = redis.from_url(self.redis_url)
        
        # Monitoring configuration
        self.monitoring_config = {
            'authorization': {
                'performance_thresholds': {
                    'accuracy': {'warning': 0.85, 'critical': 0.80},
                    'precision': {'warning': 0.83, 'critical': 0.78},
                    'recall': {'warning': 0.82, 'critical': 0.77},
                    'f1': {'warning': 0.84, 'critical': 0.79},
                    'auc': {'warning': 0.88, 'critical': 0.83}
                },
                'drift_thresholds': {
                    'data_drift': {'warning': 0.3, 'critical': 0.5},
                    'target_drift': {'warning': 0.2, 'critical': 0.4}
                },
                'feature_importance_threshold': 0.1
            },
            'fraud_detection': {
                'performance_thresholds': {
                    'accuracy': {'warning': 0.88, 'critical': 0.83},
                    'precision': {'warning': 0.85, 'critical': 0.80},
                    'recall': {'warning': 0.87, 'critical': 0.82},
                    'f1': {'warning': 0.86, 'critical': 0.81},
                    'auc': {'warning': 0.91, 'critical': 0.86}
                },
                'drift_thresholds': {
                    'data_drift': {'warning': 0.25, 'critical': 0.45},
                    'target_drift': {'warning': 0.15, 'critical': 0.35}
                }
            },
            'risk_assessment': {
                'performance_thresholds': {
                    'r2': {'warning': 0.75, 'critical': 0.70},
                    'mse': {'warning': 0.15, 'critical': 0.25},
                    'mae': {'warning': 0.12, 'critical': 0.20}
                },
                'drift_thresholds': {
                    'data_drift': {'warning': 0.35, 'critical': 0.55}
                }
            },
            'cost_prediction': {
                'performance_thresholds': {
                    'r2': {'warning': 0.70, 'critical': 0.65},
                    'mse': {'warning': 0.20, 'critical': 0.30},
                    'mae': {'warning': 0.15, 'critical': 0.25}
                },
                'drift_thresholds': {
                    'data_drift': {'warning': 0.30, 'critical': 0.50}
                }
            }
        }
        
        # Prometheus metrics
        registry = CollectorRegistry()
        self.model_accuracy = Gauge('ml_model_accuracy_current', 'Current model accuracy', 
                                   ['model_type'], registry=registry)
        self.model_drift_score = Gauge('ml_model_drift_score', 'Model drift score',
                                      ['model_type', 'drift_type'], registry=registry)
        self.prediction_latency = Histogram('ml_prediction_latency_seconds', 'Prediction latency',
                                          ['model_type'], registry=registry)
        self.error_rate = Counter('ml_prediction_errors_total', 'Prediction errors',
                                 ['model_type', 'error_type'], registry=registry)
        self.data_quality_score = Gauge('ml_data_quality_score', 'Data quality score',
                                       ['model_type'], registry=registry)
        
        self.registry = registry
    
    async def start_monitoring(self):
        """Start the monitoring process"""
        logger.info("Starting ML model monitoring...")
        
        # Start monitoring tasks
        tasks = [
            self.monitor_model_performance(),
            self.monitor_data_drift(),
            self.monitor_prediction_quality(),
            self.monitor_system_health(),
            self.generate_reports()
        ]
        
        await asyncio.gather(*tasks)
    
    async def monitor_model_performance(self):
        """Monitor real-time model performance"""
        while True:
            try:
                model_types = ['authorization', 'fraud_detection', 'risk_assessment', 'cost_prediction']
                
                for model_type in model_types:
                    performance_metrics = await self._calculate_current_performance(model_type)
                    
                    if performance_metrics:
                        await self._check_performance_alerts(model_type, performance_metrics)
                        await self._update_performance_metrics(model_type, performance_metrics)
                
                await asyncio.sleep(300)  # Check every 5 minutes
                
            except Exception as e:
                logger.error(f"Error in performance monitoring: {e}")
                await asyncio.sleep(60)
    
    async def monitor_data_drift(self):
        """Monitor for data drift"""
        while True:
            try:
                model_types = ['authorization', 'fraud_detection', 'risk_assessment', 'cost_prediction']
                
                for model_type in model_types:
                    drift_results = await self._detect_data_drift(model_type)
                    
                    if drift_results:
                        await self._check_drift_alerts(model_type, drift_results)
                        await self._update_drift_metrics(model_type, drift_results)
                
                await asyncio.sleep(1800)  # Check every 30 minutes
                
            except Exception as e:
                logger.error(f"Error in drift monitoring: {e}")
                await asyncio.sleep(300)
    
    async def monitor_prediction_quality(self):
        """Monitor prediction quality and feedback"""
        while True:
            try:
                # Check recent predictions and feedback
                quality_metrics = await self._calculate_prediction_quality()
                
                for model_type, metrics in quality_metrics.items():
                    await self._update_quality_metrics(model_type, metrics)
                
                await asyncio.sleep(900)  # Check every 15 minutes
                
            except Exception as e:
                logger.error(f"Error in prediction quality monitoring: {e}")
                await asyncio.sleep(300)
    
    async def monitor_system_health(self):
        """Monitor overall system health"""
        while True:
            try:
                health_metrics = await self._check_system_health()
                await self._update_health_metrics(health_metrics)
                
                await asyncio.sleep(60)  # Check every minute
                
            except Exception as e:
                logger.error(f"Error in system health monitoring: {e}")
                await asyncio.sleep(60)
    
    async def generate_reports(self):
        """Generate periodic monitoring reports"""
        while True:
            try:
                # Generate daily reports
                if datetime.now().hour == 6 and datetime.now().minute < 5:  # 6 AM daily
                    await self._generate_daily_report()
                
                # Generate weekly reports
                if datetime.now().weekday() == 0 and datetime.now().hour == 8:  # Monday 8 AM
                    await self._generate_weekly_report()
                
                await asyncio.sleep(300)  # Check every 5 minutes
                
            except Exception as e:
                logger.error(f"Error in report generation: {e}")
                await asyncio.sleep(300)
    
    async def _calculate_current_performance(self, model_type: str) -> Optional[Dict[str, float]]:
        """Calculate current model performance metrics"""
        try:
            # Get recent predictions and actual outcomes
            query = """
            SELECT ar.prediction_data, ar.actual_outcome, ar.created_at
            FROM ai.analysis_results ar
            JOIN ai.models m ON ar.model_id = m.id
            WHERE m.type = %s
              AND ar.analyzed_at >= NOW() - INTERVAL '24 hours'
              AND ar.actual_outcome IS NOT NULL
            ORDER BY ar.analyzed_at DESC
            LIMIT 1000
            """
            
            df = pd.read_sql(query, self.engine, params=[model_type])
            
            if df.empty:
                return None
            
            # Extract predictions and actual outcomes
            predictions = []
            actuals = []
            
            for _, row in df.iterrows():
                pred_data = json.loads(row['prediction_data']) if isinstance(row['prediction_data'], str) else row['prediction_data']
                
                if model_type in ['authorization', 'fraud_detection']:
                    predictions.append(pred_data.get('recommendation') or pred_data.get('prediction', 0))
                    actuals.append(row['actual_outcome'])
                else:
                    # Regression models
                    predictions.append(pred_data.get('predicted_value', 0))
                    actuals.append(float(row['actual_outcome']))
            
            if not predictions:
                return None
            
            # Calculate metrics
            if model_type in ['authorization', 'fraud_detection']:
                from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
                
                # Convert to binary if needed
                pred_binary = [1 if p in ['approved', 'confirmed'] else 0 for p in predictions]
                actual_binary = [1 if a in ['approved', 'confirmed'] else 0 for a in actuals]
                
                return {
                    'accuracy': accuracy_score(actual_binary, pred_binary),
                    'precision': precision_score(actual_binary, pred_binary, average='weighted', zero_division=0),
                    'recall': recall_score(actual_binary, pred_binary, average='weighted', zero_division=0),
                    'f1': f1_score(actual_binary, pred_binary, average='weighted', zero_division=0)
                }
            else:
                from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
                
                return {
                    'mse': mean_squared_error(actuals, predictions),
                    'mae': mean_absolute_error(actuals, predictions),
                    'r2': r2_score(actuals, predictions)
                }
                
        except Exception as e:
            logger.error(f"Error calculating performance for {model_type}: {e}")
            return None
    
    async def _detect_data_drift(self, model_type: str) -> Optional[Dict[str, Any]]:
        """Detect data drift using statistical methods"""
        try:
            # Get reference data (training data sample) and current data
            reference_data = await self._get_reference_data(model_type)
            current_data = await self._get_current_data(model_type)
            
            if reference_data.empty or current_data.empty:
                return None
            
            # Align columns
            common_columns = set(reference_data.columns) & set(current_data.columns)
            reference_data = reference_data[list(common_columns)]
            current_data = current_data[list(common_columns)]
            
            # Calculate drift metrics
            drift_results = {}
            
            # Statistical tests for numerical features
            for column in reference_data.select_dtypes(include=[np.number]).columns:
                ref_values = reference_data[column].dropna()
                curr_values = current_data[column].dropna()
                
                if len(ref_values) > 10 and len(curr_values) > 10:
                    # Kolmogorov-Smirnov test
                    ks_stat, ks_pvalue = stats.ks_2samp(ref_values, curr_values)
                    
                    # Population Stability Index (PSI)
                    psi_score = self._calculate_psi(ref_values, curr_values)
                    
                    drift_results[column] = {
                        'ks_statistic': ks_stat,
                        'ks_pvalue': ks_pvalue,
                        'psi_score': psi_score,
                        'drift_detected': ks_pvalue < 0.05 or psi_score > 0.2
                    }
            
            # Overall drift score
            drift_scores = [result['psi_score'] for result in drift_results.values()]
            overall_drift = np.mean(drift_scores) if drift_scores else 0
            
            return {
                'overall_drift_score': overall_drift,
                'feature_drift': drift_results,
                'drift_detected': overall_drift > 0.2,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error detecting drift for {model_type}: {e}")
            return None
    
    def _calculate_psi(self, reference: pd.Series, current: pd.Series, buckets: int = 10) -> float:
        """Calculate Population Stability Index (PSI)"""
        try:
            # Create buckets based on reference data quantiles
            bucket_edges = np.percentile(reference, np.linspace(0, 100, buckets + 1))
            bucket_edges[0] = -np.inf
            bucket_edges[-1] = np.inf
            
            # Calculate distributions
            ref_dist = pd.cut(reference, bucket_edges, include_lowest=True).value_counts(normalize=True, sort=False)
            curr_dist = pd.cut(current, bucket_edges, include_lowest=True).value_counts(normalize=True, sort=False)
            
            # Ensure no zero values (add small epsilon)
            ref_dist = ref_dist + 1e-6
            curr_dist = curr_dist + 1e-6
            
            # Calculate PSI
            psi = np.sum((curr_dist - ref_dist) * np.log(curr_dist / ref_dist))
            
            return float(psi)
            
        except Exception as e:
            logger.error(f"Error calculating PSI: {e}")
            return 0.0
    
    async def _get_reference_data(self, model_type: str) -> pd.DataFrame:
        """Get reference data for drift detection"""
        query = """
        SELECT feature_data
        FROM ai.model_training_data
        WHERE model_type = %s
          AND data_type = 'reference'
          AND created_at >= NOW() - INTERVAL '30 days'
        ORDER BY RANDOM()
        LIMIT 1000
        """
        
        try:
            df = pd.read_sql(query, self.engine, params=[model_type])
            
            if not df.empty:
                # Parse feature data
                features = []
                for _, row in df.iterrows():
                    feature_data = json.loads(row['feature_data']) if isinstance(row['feature_data'], str) else row['feature_data']
                    features.append(feature_data)
                
                return pd.DataFrame(features)
            
            return pd.DataFrame()
            
        except Exception as e:
            logger.error(f"Error getting reference data for {model_type}: {e}")
            return pd.DataFrame()
    
    async def _get_current_data(self, model_type: str) -> pd.DataFrame:
        """Get current data for drift detection"""
        query = """
        SELECT feature_data
        FROM ai.analysis_results
        WHERE analysis_type = %s
          AND analyzed_at >= NOW() - INTERVAL '24 hours'
        ORDER BY analyzed_at DESC
        LIMIT 1000
        """
        
        try:
            df = pd.read_sql(query, self.engine, params=[model_type])
            
            if not df.empty:
                # Parse feature data
                features = []
                for _, row in df.iterrows():
                    feature_data = json.loads(row['feature_data']) if isinstance(row['feature_data'], str) else row['feature_data']
                    features.append(feature_data)
                
                return pd.DataFrame(features)
            
            return pd.DataFrame()
            
        except Exception as e:
            logger.error(f"Error getting current data for {model_type}: {e}")
            return pd.DataFrame()
    
    async def _calculate_prediction_quality(self) -> Dict[str, Dict[str, float]]:
        """Calculate prediction quality metrics"""
        quality_metrics = {}
        
        model_types = ['authorization', 'fraud_detection', 'risk_assessment', 'cost_prediction']
        
        for model_type in model_types:
            try:
                # Get recent predictions with feedback
                query = """
                SELECT ar.confidence_score, ar.processing_time_ms, fb.feedback_type, fb.accuracy_rating
                FROM ai.analysis_results ar
                LEFT JOIN ai.prediction_feedback fb ON ar.id = fb.prediction_id
                WHERE ar.analysis_type = %s
                  AND ar.analyzed_at >= NOW() - INTERVAL '24 hours'
                """
                
                df = pd.read_sql(query, self.engine, params=[model_type])
                
                if not df.empty:
                    metrics = {
                        'avg_confidence': df['confidence_score'].mean(),
                        'avg_processing_time': df['processing_time_ms'].mean(),
                        'feedback_accuracy': 0.0,
                        'total_predictions': len(df),
                        'predictions_with_feedback': df['feedback_type'].notna().sum()
                    }
                    
                    # Calculate feedback accuracy if available
                    if 'accuracy_rating' in df.columns and df['accuracy_rating'].notna().any():
                        metrics['feedback_accuracy'] = df['accuracy_rating'].mean()
                    
                    quality_metrics[model_type] = metrics
                    
            except Exception as e:
                logger.error(f"Error calculating quality metrics for {model_type}: {e}")
        
        return quality_metrics
    
    async def _check_performance_alerts(self, model_type: str, metrics: Dict[str, float]):
        """Check for performance-based alerts"""
        config = self.monitoring_config.get(model_type, {})
        thresholds = config.get('performance_thresholds', {})
        
        for metric_name, value in metrics.items():
            if metric_name in thresholds:
                threshold_config = thresholds[metric_name]
                
                alert_level = None
                threshold_value = None
                
                if value < threshold_config.get('critical', 0):
                    alert_level = AlertLevel.CRITICAL
                    threshold_value = threshold_config['critical']
                elif value < threshold_config.get('warning', 0):
                    alert_level = AlertLevel.WARNING
                    threshold_value = threshold_config['warning']
                
                if alert_level:
                    alert = PerformanceAlert(
                        model_type=model_type,
                        metric_name=metric_name,
                        current_value=value,
                        threshold=threshold_value,
                        alert_level=alert_level,
                        timestamp=datetime.now(),
                        details={
                            'all_metrics': metrics,
                            'threshold_config': threshold_config
                        }
                    )
                    
                    await self._send_alert(alert)
    
    async def _check_drift_alerts(self, model_type: str, drift_results: Dict[str, Any]):
        """Check for drift-based alerts"""
        config = self.monitoring_config.get(model_type, {})
        thresholds = config.get('drift_thresholds', {})
        
        drift_score = drift_results.get('overall_drift_score', 0)
        
        for drift_type, threshold_config in thresholds.items():
            alert_level = None
            threshold_value = None
            
            if drift_score > threshold_config.get('critical', 1.0):
                alert_level = AlertLevel.CRITICAL
                threshold_value = threshold_config['critical']
            elif drift_score > threshold_config.get('warning', 0.5):
                alert_level = AlertLevel.WARNING
                threshold_value = threshold_config['warning']
            
            if alert_level:
                alert = DriftAlert(
                    model_type=model_type,
                    metric_name=drift_type,
                    current_value=drift_score,
                    baseline_value=0.0,
                    drift_score=drift_score,
                    alert_level=alert_level,
                    timestamp=datetime.now(),
                    details=drift_results
                )
                
                await self._send_alert(alert)
    
    async def _send_alert(self, alert):
        """Send alert to appropriate channels"""
        try:
            alert_data = {
                'type': 'drift_alert' if isinstance(alert, DriftAlert) else 'performance_alert',
                'model_type': alert.model_type,
                'metric_name': alert.metric_name,
                'alert_level': alert.alert_level.value,
                'current_value': alert.current_value,
                'timestamp': alert.timestamp.isoformat(),
                'details': alert.details
            }
            
            # Send to Redis for real-time alerts
            self.redis.lpush('ml_alerts', json.dumps(alert_data))
            self.redis.ltrim('ml_alerts', 0, 1000)  # Keep last 1000 alerts
            
            # Log alert
            logger.warning(f"ML Alert: {alert.alert_level.value} - {alert.model_type} - {alert.metric_name} = {alert.current_value}")
            
            # Send to notification system (email, Slack, etc.)
            await self._send_notification(alert_data)
            
        except Exception as e:
            logger.error(f"Error sending alert: {e}")
    
    async def _send_notification(self, alert_data: Dict[str, Any]):
        """Send notification via external channels"""
        # Implementation would integrate with your notification system
        # For example: Slack, email, PagerDuty, etc.
        pass
    
    async def _update_performance_metrics(self, model_type: str, metrics: Dict[str, float]):
        """Update Prometheus performance metrics"""
        try:
            primary_metric = 'accuracy' if model_type in ['authorization', 'fraud_detection'] else 'r2'
            
            if primary_metric in metrics:
                self.model_accuracy.labels(model_type=model_type).set(metrics[primary_metric])
            
            # Push to Prometheus Gateway
            push_to_gateway(self.prometheus_gateway, job='ml_monitoring', registry=self.registry)
            
        except Exception as e:
            logger.error(f"Error updating performance metrics: {e}")
    
    async def _update_drift_metrics(self, model_type: str, drift_results: Dict[str, Any]):
        """Update Prometheus drift metrics"""
        try:
            drift_score = drift_results.get('overall_drift_score', 0)
            self.model_drift_score.labels(model_type=model_type, drift_type='data').set(drift_score)
            
            # Push to Prometheus Gateway
            push_to_gateway(self.prometheus_gateway, job='ml_monitoring', registry=self.registry)
            
        except Exception as e:
            logger.error(f"Error updating drift metrics: {e}")
    
    async def _update_quality_metrics(self, model_type: str, metrics: Dict[str, float]):
        """Update data quality metrics"""
        try:
            # Calculate overall data quality score
            quality_score = min(1.0, metrics.get('avg_confidence', 0.5) * 
                              (1.0 if metrics.get('predictions_with_feedback', 0) > 0 else 0.8))
            
            self.data_quality_score.labels(model_type=model_type).set(quality_score)
            
        except Exception as e:
            logger.error(f"Error updating quality metrics: {e}")
    
    async def _check_system_health(self) -> Dict[str, Any]:
        """Check overall system health"""
        health_metrics = {
            'timestamp': datetime.now().isoformat(),
            'database_connected': await self._check_database_health(),
            'redis_connected': await self._check_redis_health(),
            'ml_service_healthy': await self._check_ml_service_health(),
            'prediction_queue_size': await self._get_prediction_queue_size(),
            'error_rate_last_hour': await self._get_error_rate()
        }
        
        return health_metrics
    
    async def _update_health_metrics(self, health_metrics: Dict[str, Any]):
        """Update system health metrics"""
        # This would update various health gauges
        pass
    
    async def _check_database_health(self) -> bool:
        """Check database connectivity"""
        try:
            result = self.engine.execute(text("SELECT 1"))
            return True
        except:
            return False
    
    async def _check_redis_health(self) -> bool:
        """Check Redis connectivity"""
        try:
            self.redis.ping()
            return True
        except:
            return False
    
    async def _check_ml_service_health(self) -> bool:
        """Check ML service health"""
        try:
            # This would make a health check request to the ML service
            return True  # Placeholder
        except:
            return False
    
    async def _get_prediction_queue_size(self) -> int:
        """Get current prediction queue size"""
        try:
            return self.redis.llen('prediction_queue')
        except:
            return 0
    
    async def _get_error_rate(self) -> float:
        """Get error rate for last hour"""
        try:
            # Calculate from Redis logs or database
            return 0.02  # Placeholder: 2% error rate
        except:
            return 0.0
    
    async def _generate_daily_report(self):
        """Generate daily monitoring report"""
        try:
            logger.info("Generating daily ML monitoring report")
            
            report_data = {
                'date': datetime.now().date().isoformat(),
                'model_performance': {},
                'drift_analysis': {},
                'system_health': await self._check_system_health(),
                'alerts_summary': await self._get_alerts_summary(24)  # Last 24 hours
            }
            
            # Get performance for each model
            model_types = ['authorization', 'fraud_detection', 'risk_assessment', 'cost_prediction']
            for model_type in model_types:
                performance = await self._calculate_current_performance(model_type)
                if performance:
                    report_data['model_performance'][model_type] = performance
                
                drift = await self._detect_data_drift(model_type)
                if drift:
                    report_data['drift_analysis'][model_type] = drift
            
            # Store report
            report_key = f"daily_report:{datetime.now().date().isoformat()}"
            self.redis.setex(report_key, 86400 * 7, json.dumps(report_data))  # Keep for 7 days
            
            logger.info("Daily report generated successfully")
            
        except Exception as e:
            logger.error(f"Error generating daily report: {e}")
    
    async def _generate_weekly_report(self):
        """Generate weekly monitoring report"""
        try:
            logger.info("Generating weekly ML monitoring report")
            
            # Implementation for weekly trend analysis
            # This would include longer-term trends, model comparison, etc.
            
        except Exception as e:
            logger.error(f"Error generating weekly report: {e}")
    
    async def _get_alerts_summary(self, hours: int) -> Dict[str, Any]:
        """Get summary of alerts from last N hours"""
        try:
            # Get alerts from Redis
            alerts = self.redis.lrange('ml_alerts', 0, -1)
            
            cutoff_time = datetime.now() - timedelta(hours=hours)
            recent_alerts = []
            
            for alert_json in alerts:
                alert_data = json.loads(alert_json)
                alert_time = datetime.fromisoformat(alert_data['timestamp'])
                
                if alert_time >= cutoff_time:
                    recent_alerts.append(alert_data)
            
            # Summarize alerts
            summary = {
                'total_alerts': len(recent_alerts),
                'critical_alerts': len([a for a in recent_alerts if a['alert_level'] == 'critical']),
                'warning_alerts': len([a for a in recent_alerts if a['alert_level'] == 'warning']),
                'alerts_by_model': {},
                'alerts_by_type': {}
            }
            
            for alert in recent_alerts:
                model_type = alert['model_type']
                alert_type = alert['type']
                
                summary['alerts_by_model'][model_type] = summary['alerts_by_model'].get(model_type, 0) + 1
                summary['alerts_by_type'][alert_type] = summary['alerts_by_type'].get(alert_type, 0) + 1
            
            return summary
            
        except Exception as e:
            logger.error(f"Error getting alerts summary: {e}")
            return {}

if __name__ == "__main__":
    async def main():
        monitor = ModelMonitor()
        await monitor.start_monitoring()
    
    asyncio.run(main())