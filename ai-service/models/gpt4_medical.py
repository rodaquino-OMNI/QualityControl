"""
GPT-4 Medical Chat Interface for Medical Audit Assistance
"""
import openai
from typing import Any, Dict, List, Optional, Tuple
import time
import json
from loguru import logger

from .base import BaseAIModel, ModelInput, ModelPrediction
from config.settings import settings


class GPT4MedicalModel(BaseAIModel):
    """GPT-4 model for medical audit assistance with context management."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.api_key = settings.openai_api_key
        self.model_id = config.get("model_id", "gpt-4-turbo-preview")
        self.temperature = config.get("temperature", 0.3)
        self.max_tokens = config.get("max_tokens", 2000)
        self.system_prompt = config.get("system_prompt", "")
        self.client = None
        self.context_history = {}  # Store conversation contexts
    
    async def load_model(self) -> None:
        """Initialize OpenAI client."""
        try:
            logger.info(f"Initializing GPT-4 Medical client: {self.model_id}")
            self.client = openai.AsyncOpenAI(api_key=self.api_key)
            self.is_loaded = True
            logger.info("GPT-4 Medical client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize GPT-4 Medical client: {e}")
            raise
    
    async def predict(self, input_data: ModelInput) -> ModelPrediction:
        """Generate medical audit analysis using GPT-4."""
        start_time = time.time()
        
        # Extract case data
        case_data = self._extract_case_data(input_data)
        
        # Build context-aware prompt
        messages = self._build_messages(case_data, input_data.case_id)
        
        try:
            # Call GPT-4
            response = await self.client.chat.completions.create(
                model=self.model_id,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"}
            )
            
            # Parse response
            result = json.loads(response.choices[0].message.content)
            
            # Update context history
            self._update_context(input_data.case_id, messages, result)
            
            # Calculate confidence based on response
            confidence = self._calculate_confidence(result)
            
            processing_time = (time.time() - start_time) * 1000
            
            return ModelPrediction(
                model_name=self.model_name,
                model_version=self.model_version,
                prediction={
                    "decision": result.get("decision", "requires_review"),
                    "analysis": result.get("analysis", {}),
                    "recommendations": result.get("recommendations", []),
                    "risk_factors": result.get("risk_factors", []),
                    "compliance_check": result.get("compliance_check", {}),
                    "citations": result.get("citations", [])
                },
                confidence=confidence,
                explanation=result.get("explanation", ""),
                features_used=list(case_data.keys()),
                processing_time_ms=processing_time
            )
            
        except Exception as e:
            logger.error(f"GPT-4 Medical prediction failed: {e}")
            raise
    
    def _extract_case_data(self, input_data: ModelInput) -> Dict[str, Any]:
        """Extract and structure case data for GPT-4."""
        return {
            "case_id": input_data.case_id,
            "patient_age": input_data.data.get("patient_age"),
            "patient_gender": input_data.data.get("patient_gender"),
            "procedure_code": input_data.data.get("procedure_code"),
            "procedure_description": input_data.data.get("procedure_description"),
            "diagnosis_code": input_data.data.get("diagnosis_code"),
            "diagnosis_description": input_data.data.get("diagnosis_description"),
            "medical_history": input_data.data.get("medical_history", []),
            "current_medications": input_data.data.get("current_medications", []),
            "provider_info": input_data.data.get("provider_info", {}),
            "cost_requested": input_data.data.get("cost_requested"),
            "urgency_level": input_data.data.get("urgency_level", "routine"),
            "additional_notes": input_data.data.get("additional_notes", "")
        }
    
    def _build_messages(self, case_data: Dict[str, Any], case_id: str) -> List[Dict[str, str]]:
        """Build conversation messages with context."""
        messages = [
            {"role": "system", "content": self.system_prompt}
        ]
        
        # Add context from previous interactions if available
        if case_id in self.context_history:
            messages.extend(self.context_history[case_id][-4:])  # Last 2 exchanges
        
        # Create user prompt
        user_prompt = f"""
        Analise o seguinte caso médico para autorização:
        
        **Informações do Caso:**
        - ID do Caso: {case_data['case_id']}
        - Idade do Paciente: {case_data['patient_age']} anos
        - Gênero: {case_data['patient_gender']}
        - Código do Procedimento: {case_data['procedure_code']}
        - Descrição: {case_data['procedure_description']}
        - Diagnóstico (CID): {case_data['diagnosis_code']}
        - Descrição do Diagnóstico: {case_data['diagnosis_description']}
        - Urgência: {case_data['urgency_level']}
        - Valor Solicitado: R$ {case_data['cost_requested']}
        
        **Histórico Médico:**
        {json.dumps(case_data['medical_history'], indent=2, ensure_ascii=False)}
        
        **Medicações Atuais:**
        {json.dumps(case_data['current_medications'], indent=2, ensure_ascii=False)}
        
        **Notas Adicionais:**
        {case_data['additional_notes']}
        
        Por favor, forneça uma análise completa em formato JSON com:
        1. decision: "approved", "denied", ou "requires_review"
        2. analysis: Análise detalhada do caso
        3. recommendations: Lista de recomendações
        4. risk_factors: Fatores de risco identificados
        5. compliance_check: Verificação de conformidade com diretrizes ANS
        6. citations: Referências a protocolos ou literatura médica
        7. explanation: Explicação clara e concisa da decisão
        """
        
        messages.append({"role": "user", "content": user_prompt})
        
        return messages
    
    def _update_context(self, case_id: str, messages: List[Dict], result: Dict) -> None:
        """Update conversation context for future interactions."""
        if case_id not in self.context_history:
            self.context_history[case_id] = []
        
        # Add user message and assistant response
        self.context_history[case_id].extend([
            messages[-1],  # User message
            {"role": "assistant", "content": json.dumps(result, ensure_ascii=False)}
        ])
        
        # Keep only last 10 messages
        if len(self.context_history[case_id]) > 10:
            self.context_history[case_id] = self.context_history[case_id][-10:]
    
    def _calculate_confidence(self, result: Dict) -> float:
        """Calculate confidence score based on GPT-4 response."""
        base_confidence = 0.7  # Base confidence for GPT-4
        
        # Adjust based on decision clarity
        decision = result.get("decision", "")
        if decision in ["approved", "denied"]:
            base_confidence += 0.1
        
        # Adjust based on citations
        citations = result.get("citations", [])
        if len(citations) > 2:
            base_confidence += 0.1
        
        # Adjust based on risk factors
        risk_factors = result.get("risk_factors", [])
        if len(risk_factors) == 0:
            base_confidence += 0.05
        elif len(risk_factors) > 3:
            base_confidence -= 0.1
        
        return min(max(base_confidence, 0.0), 1.0)
    
    async def chat(self, case_id: str, question: str) -> Dict[str, Any]:
        """Interactive chat for clarifications about a case."""
        if case_id not in self.context_history:
            return {
                "error": "No context found for this case. Please analyze the case first."
            }
        
        messages = [
            {"role": "system", "content": self.system_prompt}
        ]
        messages.extend(self.context_history[case_id])
        messages.append({"role": "user", "content": question})
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model_id,
                messages=messages,
                temperature=self.temperature,
                max_tokens=1000
            )
            
            answer = response.choices[0].message.content
            
            # Update context
            self.context_history[case_id].extend([
                {"role": "user", "content": question},
                {"role": "assistant", "content": answer}
            ])
            
            return {
                "answer": answer,
                "confidence": 0.85,
                "model": self.model_id
            }
            
        except Exception as e:
            logger.error(f"Chat interaction failed: {e}")
            return {"error": str(e)}
    
    async def validate_input(self, input_data: ModelInput) -> Tuple[bool, Optional[str]]:
        """Validate input data for GPT-4 processing."""
        required_fields = [
            "procedure_code", "diagnosis_code", "patient_age", 
            "cost_requested", "procedure_description"
        ]
        
        for field in required_fields:
            if field not in input_data.data:
                return False, f"Campo obrigatório ausente: {field}"
        
        # Validate data types
        try:
            age = int(input_data.data.get("patient_age", 0))
            if age < 0 or age > 150:
                return False, "Idade do paciente inválida"
        except ValueError:
            return False, "Idade deve ser um número"
        
        try:
            cost = float(input_data.data.get("cost_requested", 0))
            if cost < 0:
                return False, "Valor solicitado não pode ser negativo"
        except ValueError:
            return False, "Valor solicitado deve ser numérico"
        
        return True, None
    
    def clear_context(self, case_id: Optional[str] = None) -> None:
        """Clear conversation context."""
        if case_id:
            self.context_history.pop(case_id, None)
        else:
            self.context_history.clear()