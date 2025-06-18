"""
BERT Medical Model for Portuguese Medical Text Analysis
"""
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, AutoModelForTokenClassification
from typing import Any, Dict, List, Optional, Tuple
import time
from loguru import logger

from .base import BaseAIModel, ModelInput, ModelPrediction


class BERTMedicalModel(BaseAIModel):
    """BERT model specialized for medical text analysis in Portuguese."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.model_id = config.get("model_id", "pucpr/biobertpt-all")
        self.max_tokens = config.get("max_tokens", 512)
        self.confidence_threshold = config.get("confidence_threshold", 0.85)
        self.tokenizer = None
        self.classification_model = None
        self.ner_model = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    async def load_model(self) -> None:
        """Load BERT models and tokenizer."""
        try:
            logger.info(f"Loading BERT Medical model: {self.model_id}")
            
            # Load tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_id)
            
            # Load classification model for medical text
            self.classification_model = AutoModelForSequenceClassification.from_pretrained(
                self.model_id,
                num_labels=10  # Adjust based on your classification needs
            ).to(self.device)
            
            # Load NER model for entity recognition
            self.ner_model = AutoModelForTokenClassification.from_pretrained(
                self.model_id,
                num_labels=15  # Medical entities: DISEASE, SYMPTOM, MEDICATION, etc.
            ).to(self.device)
            
            # Set models to evaluation mode
            self.classification_model.eval()
            self.ner_model.eval()
            
            self.is_loaded = True
            logger.info("BERT Medical model loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load BERT Medical model: {e}")
            raise
    
    async def predict(self, input_data: ModelInput) -> ModelPrediction:
        """Analyze medical text and extract insights."""
        start_time = time.time()
        
        # Extract text from input
        medical_text = input_data.data.get("medical_text", "")
        procedure_code = input_data.data.get("procedure_code", "")
        diagnosis_code = input_data.data.get("diagnosis_code", "")
        
        # Combine relevant text
        full_text = f"Procedimento: {procedure_code}. Diagnóstico: {diagnosis_code}. {medical_text}"
        
        # Tokenize
        inputs = self.tokenizer(
            full_text,
            truncation=True,
            max_length=self.max_tokens,
            padding=True,
            return_tensors="pt"
        ).to(self.device)
        
        with torch.no_grad():
            # Get classification results
            classification_outputs = self.classification_model(**inputs)
            classification_probs = torch.nn.functional.softmax(classification_outputs.logits, dim=-1)
            
            # Get NER results
            ner_outputs = self.ner_model(**inputs)
            ner_predictions = torch.argmax(ner_outputs.logits, dim=-1)
        
        # Process results
        medical_classification = self._process_classification(classification_probs)
        medical_entities = self._extract_entities(inputs, ner_predictions)
        
        # Calculate confidence
        confidence = float(torch.max(classification_probs).cpu())
        
        # Generate explanation
        explanation = self._generate_explanation(
            medical_classification,
            medical_entities,
            confidence
        )
        
        processing_time = (time.time() - start_time) * 1000
        
        return ModelPrediction(
            model_name=self.model_name,
            model_version=self.model_version,
            prediction={
                "classification": medical_classification,
                "entities": medical_entities,
                "risk_score": self._calculate_risk_score(medical_classification, medical_entities),
                "recommendations": self._generate_recommendations(medical_classification)
            },
            confidence=confidence,
            explanation=explanation,
            features_used=["medical_text", "procedure_code", "diagnosis_code"],
            processing_time_ms=processing_time
        )
    
    def _process_classification(self, probs: torch.Tensor) -> Dict[str, float]:
        """Process classification probabilities."""
        categories = [
            "appropriate_procedure",
            "unnecessary_procedure",
            "requires_additional_info",
            "high_complexity",
            "emergency_case",
            "elective_procedure",
            "experimental_treatment",
            "standard_protocol",
            "alternative_available",
            "cost_concern"
        ]
        
        probs_list = probs[0].cpu().tolist()
        return {cat: prob for cat, prob in zip(categories, probs_list)}
    
    def _extract_entities(self, inputs: Dict, predictions: torch.Tensor) -> List[Dict[str, Any]]:
        """Extract medical entities from text."""
        entities = []
        tokens = self.tokenizer.convert_ids_to_tokens(inputs["input_ids"][0])
        predictions_list = predictions[0].cpu().tolist()
        
        entity_labels = {
            0: "O",
            1: "B-DISEASE",
            2: "I-DISEASE",
            3: "B-SYMPTOM",
            4: "I-SYMPTOM",
            5: "B-MEDICATION",
            6: "I-MEDICATION",
            7: "B-PROCEDURE",
            8: "I-PROCEDURE",
            9: "B-ANATOMY",
            10: "I-ANATOMY",
            11: "B-TEST",
            12: "I-TEST",
            13: "B-DOSAGE",
            14: "I-DOSAGE"
        }
        
        current_entity = None
        current_tokens = []
        
        for token, label_id in zip(tokens, predictions_list):
            label = entity_labels.get(label_id, "O")
            
            if label.startswith("B-"):
                if current_entity:
                    entities.append({
                        "type": current_entity,
                        "text": " ".join(current_tokens).replace(" ##", ""),
                        "confidence": 0.9  # Simplified confidence
                    })
                current_entity = label[2:]
                current_tokens = [token]
            elif label.startswith("I-") and current_entity == label[2:]:
                current_tokens.append(token)
            else:
                if current_entity:
                    entities.append({
                        "type": current_entity,
                        "text": " ".join(current_tokens).replace(" ##", ""),
                        "confidence": 0.9
                    })
                current_entity = None
                current_tokens = []
        
        return entities
    
    def _calculate_risk_score(self, classification: Dict[str, float], entities: List[Dict]) -> float:
        """Calculate overall risk score for the medical case."""
        base_risk = classification.get("unnecessary_procedure", 0) * 0.4
        base_risk += classification.get("experimental_treatment", 0) * 0.3
        base_risk += classification.get("cost_concern", 0) * 0.2
        
        # Adjust based on entities
        high_risk_entities = sum(1 for e in entities if e["type"] in ["DISEASE", "SYMPTOM"])
        entity_risk = min(high_risk_entities * 0.05, 0.3)
        
        return min(base_risk + entity_risk, 1.0)
    
    def _generate_recommendations(self, classification: Dict[str, float]) -> List[str]:
        """Generate recommendations based on classification."""
        recommendations = []
        
        if classification.get("requires_additional_info", 0) > 0.5:
            recommendations.append("Solicitar informações adicionais sobre histórico médico")
        
        if classification.get("alternative_available", 0) > 0.6:
            recommendations.append("Considerar tratamentos alternativos menos invasivos")
        
        if classification.get("high_complexity", 0) > 0.7:
            recommendations.append("Encaminhar para revisão por especialista")
        
        if classification.get("emergency_case", 0) > 0.8:
            recommendations.append("Aprovar com prioridade - caso de emergência")
        
        return recommendations
    
    def _generate_explanation(self, classification: Dict[str, float], 
                            entities: List[Dict], confidence: float) -> str:
        """Generate human-readable explanation."""
        explanation_parts = []
        
        # Classification explanation
        top_category = max(classification.items(), key=lambda x: x[1])
        explanation_parts.append(
            f"Classificação principal: {top_category[0].replace('_', ' ').title()} "
            f"(confiança: {top_category[1]:.2%})"
        )
        
        # Entity summary
        if entities:
            entity_types = set(e["type"] for e in entities)
            explanation_parts.append(
                f"Entidades médicas identificadas: {', '.join(entity_types)}"
            )
        
        # Confidence assessment
        if confidence >= self.confidence_threshold:
            explanation_parts.append("Alta confiança na análise")
        else:
            explanation_parts.append("Confiança moderada - revisão humana recomendada")
        
        return " | ".join(explanation_parts)
    
    async def validate_input(self, input_data: ModelInput) -> Tuple[bool, Optional[str]]:
        """Validate input data for BERT processing."""
        required_fields = ["medical_text", "procedure_code", "diagnosis_code"]
        
        for field in required_fields:
            if field not in input_data.data:
                return False, f"Campo obrigatório ausente: {field}"
        
        # Validate text length
        medical_text = input_data.data.get("medical_text", "")
        if len(medical_text) < 10:
            return False, "Texto médico muito curto para análise"
        
        if len(medical_text) > 10000:
            return False, "Texto médico excede limite de caracteres"
        
        return True, None