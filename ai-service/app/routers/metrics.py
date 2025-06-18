from fastapi import APIRouter, HTTPException
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response
import time
import logging
import psutil
import asyncio
from typing import Dict, Any
import json

logger = logging.getLogger(__name__)
router = APIRouter()

# Prometheus metrics
ai_predictions_total = Counter(
    'austa_ai_predictions_total',
    'Total number of AI predictions made',
    ['model', 'task', 'status']
)

ai_prediction_duration = Histogram(
    'austa_ai_prediction_duration_seconds',
    'Time taken for AI predictions',
    ['model', 'task'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0]
)

ai_model_accuracy = Gauge(
    'austa_ai_model_accuracy',
    'Current AI model accuracy',
    ['model', 'task', 'dataset']
)

ai_model_confidence = Histogram(
    'austa_ai_model_confidence',
    'AI model prediction confidence scores',
    ['model', 'task'],
    buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
)

fraud_detection_scores = Histogram(
    'austa_fraud_detection_score',
    'Fraud detection risk scores',
    ['case_type', 'model'],
    buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
)

ai_processing_queue = Gauge(
    'austa_ai_processing_queue_size',
    'Number of items in AI processing queue',
    ['queue_type']
)

ai_memory_usage = Gauge(
    'austa_ai_memory_usage_bytes',
    'Memory usage by AI models',
    ['model', 'type']
)

ai_gpu_utilization = Gauge(
    'austa_ai_gpu_utilization_percent',
    'GPU utilization percentage',
    ['gpu_id']
)

# Global metrics storage
metrics_cache = {
    'last_updated': 0,
    'data': {}
}

@router.get("/metrics")
async def get_metrics():
    """Main Prometheus metrics endpoint"""
    try:
        # Update AI metrics
        await update_ai_metrics()
        
        # Generate and return metrics
        metrics_data = generate_latest()
        return Response(content=metrics_data, media_type=CONTENT_TYPE_LATEST)
    except Exception as e:
        logger.error(f"Error generating metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate metrics")

@router.get("/fraud-metrics")
async def get_fraud_metrics():
    """Fraud detection specific metrics"""
    try:
        fraud_data = await get_fraud_detection_metrics()
        
        # Update fraud metrics
        for detection in fraud_data['recent_detections']:
            fraud_detection_scores.observe(
                {
                    'case_type': detection['case_type'],
                    'model': detection['model']
                },
                detection['score']
            )
        
        # Return only fraud-related metrics
        fraud_metrics = generate_latest()
        return Response(content=fraud_metrics, media_type=CONTENT_TYPE_LATEST)
    except Exception as e:
        logger.error(f"Error generating fraud metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate fraud metrics")

@router.get("/ai-performance")
async def get_ai_performance():
    """AI performance metrics endpoint"""
    try:
        performance_data = await get_ai_performance_data()
        
        # Update performance metrics
        for model_name, stats in performance_data['models'].items():
            ai_model_accuracy.labels(
                model=model_name,
                task=stats['task'],
                dataset=stats['dataset']
            ).set(stats['accuracy'])
            
            ai_memory_usage.labels(
                model=model_name,
                type='allocated'
            ).set(stats['memory_usage'])
        
        # GPU metrics if available
        if 'gpu_stats' in performance_data:
            for gpu_id, utilization in performance_data['gpu_stats'].items():
                ai_gpu_utilization.labels(gpu_id=str(gpu_id)).set(utilization)
        
        perf_metrics = generate_latest()
        return Response(content=perf_metrics, media_type=CONTENT_TYPE_LATEST)
    except Exception as e:
        logger.error(f"Error generating AI performance metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate AI performance metrics")

@router.get("/health-metrics")
async def get_health_metrics():
    """System health metrics for AI service"""
    try:
        # System metrics
        memory = psutil.virtual_memory()
        cpu_percent = psutil.cpu_percent(interval=1)
        
        # AI service specific health
        health_data = {
            'system_memory_percent': memory.percent,
            'system_cpu_percent': cpu_percent,
            'ai_models_loaded': await get_loaded_models_count(),
            'processing_queue_size': await get_queue_size(),
            'last_prediction_time': await get_last_prediction_time()
        }
        
        return health_data
    except Exception as e:
        logger.error(f"Error getting health metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get health metrics")

async def update_ai_metrics():
    """Update AI-specific metrics"""
    current_time = time.time()
    
    # Update metrics every 30 seconds to avoid overhead
    if current_time - metrics_cache['last_updated'] < 30:
        return
    
    try:
        # Update queue sizes
        fraud_queue_size = await get_queue_size_by_type('fraud_detection')
        analysis_queue_size = await get_queue_size_by_type('case_analysis')
        
        ai_processing_queue.labels(queue_type='fraud_detection').set(fraud_queue_size)
        ai_processing_queue.labels(queue_type='case_analysis').set(analysis_queue_size)
        
        # Update model accuracies
        model_stats = await get_current_model_stats()
        for model_name, stats in model_stats.items():
            ai_model_accuracy.labels(
                model=model_name,
                task=stats['task'],
                dataset='validation'
            ).set(stats['accuracy'])
        
        metrics_cache['last_updated'] = current_time
        logger.info("AI metrics updated successfully")
        
    except Exception as e:
        logger.error(f"Error updating AI metrics: {e}")

async def get_fraud_detection_metrics() -> Dict[str, Any]:
    """Get fraud detection specific metrics"""
    # Mock data - replace with actual fraud detection queries
    return {
        'recent_detections': [
            {
                'case_type': 'insurance_claim',
                'model': 'xgboost_fraud',
                'score': 0.85,
                'timestamp': time.time()
            },
            {
                'case_type': 'financial_transaction',
                'model': 'lstm_patterns',
                'score': 0.12,
                'timestamp': time.time()
            }
        ],
        'accuracy_stats': {
            'xgboost_fraud': 0.89,
            'lstm_patterns': 0.87
        }
    }

async def get_ai_performance_data() -> Dict[str, Any]:
    """Get AI model performance data"""
    # Mock data - replace with actual model performance queries
    return {
        'models': {
            'xgboost_fraud': {
                'task': 'classification',
                'dataset': 'fraud_validation',
                'accuracy': 0.89,
                'memory_usage': 512 * 1024 * 1024,  # 512MB
                'last_training': time.time() - 86400  # 24 hours ago
            },
            'bert_medical': {
                'task': 'text_classification',
                'dataset': 'medical_docs',
                'accuracy': 0.92,
                'memory_usage': 1024 * 1024 * 1024,  # 1GB
                'last_training': time.time() - 172800  # 48 hours ago
            },
            'lstm_patterns': {
                'task': 'sequence_prediction',
                'dataset': 'pattern_analysis',
                'accuracy': 0.87,
                'memory_usage': 256 * 1024 * 1024,  # 256MB
                'last_training': time.time() - 43200  # 12 hours ago
            }
        },
        'gpu_stats': {
            0: 75.5,  # GPU 0 utilization percentage
            1: 23.1   # GPU 1 utilization percentage
        } if await check_gpu_available() else {}
    }

async def get_loaded_models_count() -> int:
    """Get count of currently loaded AI models"""
    # Mock implementation
    return 5

async def get_queue_size() -> int:
    """Get total processing queue size"""
    # Mock implementation
    return 42

async def get_queue_size_by_type(queue_type: str) -> int:
    """Get queue size by type"""
    # Mock implementation
    queue_sizes = {
        'fraud_detection': 15,
        'case_analysis': 27,
        'pattern_recognition': 8
    }
    return queue_sizes.get(queue_type, 0)

async def get_last_prediction_time() -> float:
    """Get timestamp of last prediction"""
    # Mock implementation
    return time.time() - 30  # 30 seconds ago

async def get_current_model_stats() -> Dict[str, Dict]:
    """Get current statistics for all models"""
    # Mock implementation
    return {
        'xgboost_fraud': {
            'task': 'classification',
            'accuracy': 0.89
        },
        'bert_medical': {
            'task': 'text_classification',
            'accuracy': 0.92
        },
        'lstm_patterns': {
            'task': 'sequence_prediction',
            'accuracy': 0.87
        }
    }

async def check_gpu_available() -> bool:
    """Check if GPU is available"""
    try:
        import GPUtil
        gpus = GPUtil.getGPUs()
        return len(gpus) > 0
    except ImportError:
        return False

# Decorator to track prediction metrics
def track_prediction(model_name: str, task: str):
    """Decorator to track AI prediction metrics"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            status = 'success'
            
            try:
                result = await func(*args, **kwargs)
                
                # Track confidence if available
                if isinstance(result, dict) and 'confidence' in result:
                    ai_model_confidence.labels(
                        model=model_name,
                        task=task
                    ).observe(result['confidence'])
                
                return result
            except Exception as e:
                status = 'error'
                raise e
            finally:
                # Track prediction
                ai_predictions_total.labels(
                    model=model_name,
                    task=task,
                    status=status
                ).inc()
                
                # Track duration
                duration = time.time() - start_time
                ai_prediction_duration.labels(
                    model=model_name,
                    task=task
                ).observe(duration)
        
        return wrapper
    return decorator

# Export the decorator for use in other modules
__all__ = ['router', 'track_prediction']