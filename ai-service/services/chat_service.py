"""
Chat Service
Handles chat interactions with AI models
"""
from typing import Dict, Any, Optional
from loguru import logger

from .model_manager import ModelManager
from .context_manager import ContextManager


class ChatService:
    """Service for handling chat interactions."""
    
    def __init__(self, model_manager: ModelManager, context_manager: ContextManager):
        self.model_manager = model_manager
        self.context_manager = context_manager
    
    async def process_message(self, case_id: str, message: str) -> Dict[str, Any]:
        """Process a chat message for a specific case."""
        # Get GPT-4 model
        gpt4_model = self.model_manager.get_model("gpt4_medical")
        if not gpt4_model:
            raise ValueError("Chat model not available")
        
        # Get case context
        context = await self.context_manager.get_case_context(case_id)
        
        # If no context, inform the user
        if not context:
            return {
                "answer": "Não encontrei informações sobre este caso. Por favor, execute uma análise primeiro para que eu possa ajudá-lo com perguntas específicas.",
                "confidence": 0.0,
                "sources": []
            }
        
        # Process chat with context
        try:
            result = await gpt4_model.chat(case_id, message)
            
            # Store in history
            await self.context_manager.store_chat_message(
                case_id,
                message,
                result["answer"]
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Chat processing failed: {e}")
            raise
    
    async def get_smart_suggestions(self, case_id: str) -> List[str]:
        """Generate smart question suggestions based on case context."""
        context = await self.context_manager.get_case_context(case_id)
        
        if not context:
            return []
        
        suggestions = []
        analysis_result = context.get("analysis_result", {})
        
        # Based on decision
        decision = analysis_result.get("final_decision")
        if decision == "denied":
            suggestions.append("Quais foram os principais motivos para a negativa?")
            suggestions.append("Que documentos adicionais poderiam reverter esta decisão?")
        elif decision == "requires_review":
            suggestions.append("Quais informações estão faltando para uma decisão definitiva?")
        
        # Based on risk
        risk_level = analysis_result.get("risk_assessment", {}).get("level")
        if risk_level in ["high", "critical"]:
            suggestions.append("Quais indicadores de fraude foram identificados?")
            suggestions.append("Como posso mitigar os riscos identificados?")
        
        # Based on compliance
        compliance = analysis_result.get("compliance_status", {})
        if not compliance.get("is_compliant", True):
            suggestions.append("Quais são os problemas de conformidade específicos?")
        
        # Based on recommendations
        if analysis_result.get("recommendations"):
            suggestions.append("Pode detalhar as recomendações sugeridas?")
        
        # General helpful suggestions
        suggestions.extend([
            "Compare este caso com casos similares aprovados",
            "Quais são as melhores práticas para este tipo de procedimento?",
            "Existe jurisprudência relevante para este caso?"
        ])
        
        # Return unique suggestions
        return list(dict.fromkeys(suggestions))[:8]