"""
Model Manager Service
Handles loading, unloading, and management of AI models
"""
import asyncio
from typing import Dict, Any, List, Optional
from loguru import logger
import yaml

from models import (
    BERTMedicalModel,
    GPT4MedicalModel,
    XGBoostFraudModel,
    LSTMPatternModel,
    AuditDecisionPipeline
)
from config.settings import settings


class ModelManager:
    """Manages AI model lifecycle and access."""
    
    def __init__(self):
        self.models: Dict[str, Any] = {}
        self.model_configs = self._load_model_configs()
        self._lock = asyncio.Lock()
    
    def _load_model_configs(self) -> Dict[str, Any]:
        """Load model configurations from YAML file."""
        try:
            with open("config/ai_models.yaml", "r") as f:
                config = yaml.safe_load(f)
            return config.get("models", {})
        except Exception as e:
            logger.error(f"Failed to load model configs: {e}")
            return {}
    
    async def initialize(self):
        """Initialize model manager and load essential models."""
        logger.info("Initializing Model Manager...")
        
        # Define model instances
        model_instances = {
            "bert_medical": BERTMedicalModel(
                self.model_configs.get("bert-medical", {})
            ),
            "gpt4_medical": GPT4MedicalModel(
                self.model_configs.get("gpt-4-medical", {})
            ),
            "xgboost_fraud": XGBoostFraudModel(
                self.model_configs.get("xgboost-fraud", {})
            ),
            "lstm_patterns": LSTMPatternModel(
                self.model_configs.get("lstm-patterns", {})
            )
        }
        
        # Create decision pipeline with all models
        pipeline_config = {
            "bert_config": self.model_configs.get("bert-medical", {}),
            "gpt4_config": self.model_configs.get("gpt-4-medical", {}),
            "xgboost_config": self.model_configs.get("xgboost-fraud", {}),
            "lstm_config": self.model_configs.get("lstm-patterns", {}),
            "decision_threshold": 0.75,
            "require_explanation": True,
            "enable_parallel": True,
            "stage_weights": {
                "medical_validation": 0.3,
                "expert_review": 0.3,
                "fraud_detection": 0.2,
                "pattern_analysis": 0.2
            }
        }
        
        model_instances["decision_pipeline"] = AuditDecisionPipeline(pipeline_config)
        
        # Store model instances
        self.models = model_instances
        
        # Load essential models
        essential_models = ["bert_medical", "gpt4_medical", "decision_pipeline"]
        for model_name in essential_models:
            await self.load_model(model_name)
        
        logger.info("Model Manager initialized successfully")
    
    async def load_model(self, model_name: str) -> bool:
        """Load a specific model."""
        async with self._lock:
            if model_name not in self.models:
                logger.error(f"Model {model_name} not found")
                return False
            
            model = self.models[model_name]
            
            if model.is_loaded:
                logger.info(f"Model {model_name} already loaded")
                return True
            
            try:
                logger.info(f"Loading model {model_name}...")
                await model.load_model()
                logger.info(f"Model {model_name} loaded successfully")
                return True
            except Exception as e:
                logger.error(f"Failed to load model {model_name}: {e}")
                return False
    
    async def unload_model(self, model_name: str) -> bool:
        """Unload a specific model."""
        async with self._lock:
            if model_name not in self.models:
                logger.error(f"Model {model_name} not found")
                return False
            
            model = self.models[model_name]
            
            # For now, just mark as unloaded
            # In production, would free memory/resources
            model.is_loaded = False
            logger.info(f"Model {model_name} unloaded")
            return True
    
    async def reload_all_models(self) -> Dict[str, bool]:
        """Reload all models."""
        results = {}
        
        for model_name in self.models:
            # Unload first
            await self.unload_model(model_name)
            # Then load
            results[model_name] = await self.load_model(model_name)
        
        return results
    
    def get_model(self, model_name: str) -> Optional[Any]:
        """Get a specific model instance."""
        model = self.models.get(model_name)
        
        if model and model.is_loaded:
            return model
        
        return None
    
    def list_models(self) -> List[Dict[str, Any]]:
        """List all available models."""
        model_list = []
        
        for name, model in self.models.items():
            model_info = {
                "name": name,
                "type": model.__class__.__name__,
                "version": model.model_version,
                "is_loaded": model.is_loaded,
                "description": model.model_name
            }
            model_list.append(model_info)
        
        return model_list
    
    def get_model_info(self, model_name: str) -> Optional[Dict[str, Any]]:
        """Get detailed information about a specific model."""
        model = self.models.get(model_name)
        
        if not model:
            return None
        
        return model.get_model_info()
    
    def get_loaded_models(self) -> List[str]:
        """Get list of loaded model names."""
        return [name for name, model in self.models.items() if model.is_loaded]
    
    async def check_models_ready(self) -> bool:
        """Check if all essential models are ready."""
        essential_models = ["bert_medical", "gpt4_medical", "decision_pipeline"]
        
        for model_name in essential_models:
            model = self.models.get(model_name)
            if not model or not model.is_loaded:
                return False
        
        return True
    
    async def shutdown(self):
        """Shutdown model manager and cleanup resources."""
        logger.info("Shutting down Model Manager...")
        
        # Unload all models
        for model_name in list(self.models.keys()):
            await self.unload_model(model_name)
        
        logger.info("Model Manager shut down successfully")


# Singleton instance
_model_manager: Optional[ModelManager] = None


def get_model_manager() -> ModelManager:
    """Get model manager instance."""
    global _model_manager
    
    if _model_manager is None:
        _model_manager = ModelManager()
    
    return _model_manager