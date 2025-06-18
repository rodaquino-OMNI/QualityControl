"""
Chat endpoints for interactive AI assistance
"""
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from datetime import datetime
import json

from services.model_manager import get_model_manager
from services.context_manager import get_context_manager
from services.chat_service import ChatService


router = APIRouter()


class ChatRequest(BaseModel):
    """Request model for chat interaction."""
    case_id: str = Field(..., description="Case ID for context")
    message: str = Field(..., min_length=1, description="User message")
    include_context: bool = Field(default=True, description="Include case context")


class ChatResponse(BaseModel):
    """Response model for chat interaction."""
    case_id: str
    message: str
    response: str
    confidence: float
    sources: List[str]
    timestamp: datetime


class ChatHistoryRequest(BaseModel):
    """Request for chat history."""
    case_id: str
    limit: int = Field(default=20, ge=1, le=100)


@router.post("/message", response_model=ChatResponse)
async def send_chat_message(
    request: ChatRequest,
    model_manager = Depends(get_model_manager),
    context_manager = Depends(get_context_manager)
):
    """
    Send a message to the AI assistant about a specific case.
    """
    # Get GPT-4 model
    gpt4_model = model_manager.get_model("gpt4_medical")
    if not gpt4_model:
        raise HTTPException(status_code=503, detail="Chat model not available")
    
    try:
        # Get case context if requested
        context = None
        if request.include_context:
            context = await context_manager.get_case_context(request.case_id)
            if not context:
                raise HTTPException(
                    status_code=404, 
                    detail=f"No context found for case {request.case_id}. Analyze the case first."
                )
        
        # Send chat message
        chat_result = await gpt4_model.chat(request.case_id, request.message)
        
        if "error" in chat_result:
            raise HTTPException(status_code=500, detail=chat_result["error"])
        
        # Store chat history
        await context_manager.store_chat_message(
            request.case_id,
            request.message,
            chat_result["answer"]
        )
        
        return ChatResponse(
            case_id=request.case_id,
            message=request.message,
            response=chat_result["answer"],
            confidence=chat_result.get("confidence", 0.85),
            sources=chat_result.get("sources", []),
            timestamp=datetime.utcnow()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@router.get("/history/{case_id}")
async def get_chat_history(
    case_id: str,
    limit: int = 20,
    context_manager = Depends(get_context_manager)
):
    """
    Get chat history for a specific case.
    """
    history = await context_manager.get_chat_history(case_id, limit)
    
    if not history:
        raise HTTPException(status_code=404, detail=f"No chat history found for case {case_id}")
    
    return {
        "case_id": case_id,
        "messages": history,
        "total": len(history)
    }


@router.delete("/context/{case_id}")
async def clear_chat_context(
    case_id: str,
    model_manager = Depends(get_model_manager),
    context_manager = Depends(get_context_manager)
):
    """
    Clear chat context for a specific case.
    """
    # Clear from GPT-4 model
    gpt4_model = model_manager.get_model("gpt4_medical")
    if gpt4_model:
        gpt4_model.clear_context(case_id)
    
    # Clear from context manager
    await context_manager.clear_case_context(case_id)
    
    return {
        "status": "success",
        "message": f"Context cleared for case {case_id}"
    }


@router.websocket("/ws/{case_id}")
async def websocket_chat(
    websocket: WebSocket,
    case_id: str,
    model_manager = Depends(get_model_manager),
    context_manager = Depends(get_context_manager)
):
    """
    WebSocket endpoint for real-time chat.
    """
    await websocket.accept()
    
    # Initialize chat service
    chat_service = ChatService(model_manager, context_manager)
    
    try:
        # Send initial greeting
        await websocket.send_json({
            "type": "system",
            "message": f"Connected to AI assistant for case {case_id}",
            "timestamp": datetime.utcnow().isoformat()
        })
        
        while True:
            # Receive message
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Process message
            if message_data.get("type") == "message":
                user_message = message_data.get("message", "")
                
                # Send typing indicator
                await websocket.send_json({
                    "type": "typing",
                    "timestamp": datetime.utcnow().isoformat()
                })
                
                # Get AI response
                try:
                    response = await chat_service.process_message(
                        case_id,
                        user_message
                    )
                    
                    # Send response
                    await websocket.send_json({
                        "type": "response",
                        "message": response["answer"],
                        "confidence": response.get("confidence", 0.85),
                        "timestamp": datetime.utcnow().isoformat()
                    })
                    
                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Error processing message: {str(e)}",
                        "timestamp": datetime.utcnow().isoformat()
                    })
            
            elif message_data.get("type") == "ping":
                await websocket.send_json({
                    "type": "pong",
                    "timestamp": datetime.utcnow().isoformat()
                })
    
    except WebSocketDisconnect:
        # Clean up on disconnect
        pass
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": f"WebSocket error: {str(e)}",
            "timestamp": datetime.utcnow().isoformat()
        })
        await websocket.close()


@router.post("/suggestions/{case_id}")
async def get_chat_suggestions(
    case_id: str,
    context_manager = Depends(get_context_manager)
):
    """
    Get suggested questions for a specific case.
    """
    context = await context_manager.get_case_context(case_id)
    
    if not context:
        raise HTTPException(status_code=404, detail=f"No context found for case {case_id}")
    
    # Generate suggestions based on case context
    suggestions = [
        "Quais são os principais fatores de risco identificados?",
        "Existe alguma alternativa de tratamento menos invasiva?",
        "Como este caso se compara com casos similares aprovados?",
        "Quais documentos adicionais seriam necessários para aprovação?",
        "Há algum indicador de fraude neste caso?"
    ]
    
    # Add context-specific suggestions
    if context.get("risk_level") == "high":
        suggestions.append("Por que o nível de risco foi classificado como alto?")
    
    if context.get("compliance_issues"):
        suggestions.append("Quais são os problemas de conformidade identificados?")
    
    return {
        "case_id": case_id,
        "suggestions": suggestions[:6]  # Return top 6 suggestions
    }