"""
Base Model Interface for AI Models
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel
from datetime import datetime
import uuid


class ModelPrediction(BaseModel):
    """Standard model prediction output."""
    model_name: str
    model_version: str
    prediction: Any
    confidence: float
    explanation: Optional[str] = None
    features_used: Optional[List[str]] = None
    processing_time_ms: float
    timestamp: datetime = datetime.utcnow()
    prediction_id: str = str(uuid.uuid4())


class ModelInput(BaseModel):
    """Standard model input."""
    case_id: str
    data: Dict[str, Any]
    context: Optional[Dict[str, Any]] = None
    request_id: str = str(uuid.uuid4())


class BaseAIModel(ABC):
    """Abstract base class for all AI models."""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.model_name = config.get("name", "Unknown Model")
        self.model_version = config.get("version", "0.0.0")
        self.is_loaded = False
    
    @abstractmethod
    async def load_model(self) -> None:
        """Load the model into memory."""
        pass
    
    @abstractmethod
    async def predict(self, input_data: ModelInput) -> ModelPrediction:
        """Make a prediction."""
        pass
    
    @abstractmethod
    async def validate_input(self, input_data: ModelInput) -> Tuple[bool, Optional[str]]:
        """Validate input data."""
        pass
    
    async def preprocess(self, input_data: ModelInput) -> Any:
        """Preprocess input data."""
        return input_data
    
    async def postprocess(self, raw_output: Any) -> Any:
        """Postprocess model output."""
        return raw_output
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get model information."""
        return {
            "name": self.model_name,
            "version": self.model_version,
            "type": self.__class__.__name__,
            "is_loaded": self.is_loaded,
            "config": self.config
        }


class EnsembleModel(BaseAIModel):
    """Base class for ensemble models."""
    
    def __init__(self, config: Dict[str, Any], models: List[BaseAIModel]):
        super().__init__(config)
        self.models = models
        self.weights = config.get("weights", [1.0 / len(models)] * len(models))
    
    async def load_model(self) -> None:
        """Load all constituent models."""
        for model in self.models:
            await model.load_model()
        self.is_loaded = True
    
    async def predict(self, input_data: ModelInput) -> ModelPrediction:
        """Ensemble prediction combining all models."""
        predictions = []
        total_time = 0
        
        for model, weight in zip(self.models, self.weights):
            pred = await model.predict(input_data)
            predictions.append((pred, weight))
            total_time += pred.processing_time_ms
        
        # Combine predictions
        combined_confidence = sum(p.confidence * w for p, w in predictions)
        explanations = [p.explanation for p, _ in predictions if p.explanation]
        
        return ModelPrediction(
            model_name=self.model_name,
            model_version=self.model_version,
            prediction=self._combine_predictions(predictions),
            confidence=combined_confidence,
            explanation="\n".join(explanations),
            processing_time_ms=total_time
        )
    
    def _combine_predictions(self, predictions: List[Tuple[ModelPrediction, float]]) -> Any:
        """Combine predictions from multiple models."""
        # Override in subclasses
        return predictions[0][0].prediction
    
    async def validate_input(self, input_data: ModelInput) -> Tuple[bool, Optional[str]]:
        """Validate input for all models."""
        for model in self.models:
            is_valid, error = await model.validate_input(input_data)
            if not is_valid:
                return False, f"{model.model_name}: {error}"
        return True, None