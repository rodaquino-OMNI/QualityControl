"""
Analysis endpoints for medical audit cases
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid

from models import ModelInput
from services.model_manager import get_model_manager
from services.context_manager import get_context_manager
from utils.validators import validate_case_data


router = APIRouter()


class CaseAnalysisRequest(BaseModel):
    """Request model for case analysis."""
    case_id: str = Field(..., description="Unique case identifier")
    patient_age: int = Field(..., ge=0, le=150)
    patient_gender: str = Field(..., pattern="^(M|F|O)$")
    procedure_code: str = Field(..., min_length=3)
    procedure_description: str = Field(..., min_length=10)
    diagnosis_code: str = Field(..., min_length=3)
    diagnosis_description: str = Field(..., min_length=10)
    medical_text: str = Field(..., min_length=10)
    cost_requested: float = Field(..., gt=0)
    urgency_level: str = Field(default="routine", pattern="^(routine|urgent|emergency)$")
    provider_info: Dict[str, Any] = Field(default_factory=dict)
    medical_history: List[Dict[str, Any]] = Field(default_factory=list)
    current_medications: List[str] = Field(default_factory=list)
    treatment_history: List[Dict[str, Any]] = Field(default_factory=list)
    additional_notes: Optional[str] = None


class AnalysisResponse(BaseModel):
    """Response model for analysis."""
    analysis_id: str
    case_id: str
    timestamp: datetime
    final_decision: str
    confidence_score: float
    risk_assessment: Dict[str, Any]
    recommendations: List[str]
    compliance_status: Dict[str, Any]
    required_actions: List[str]
    stage_results: Dict[str, Any]
    explanation: str


class QuickAnalysisRequest(BaseModel):
    """Request for quick single-model analysis."""
    model_name: str = Field(..., description="Model to use for analysis")
    data: Dict[str, Any] = Field(..., description="Input data for the model")
    case_id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))


@router.post("/audit", response_model=AnalysisResponse)
async def analyze_audit_case(
    request: CaseAnalysisRequest,
    background_tasks: BackgroundTasks,
    model_manager = Depends(get_model_manager),
    context_manager = Depends(get_context_manager)
):
    """
    Analyze a medical audit case using the full AI pipeline.
    """
    # Validate case data
    validation_errors = validate_case_data(request.dict())
    if validation_errors:
        raise HTTPException(status_code=400, detail=validation_errors)
    
    # Create model input
    model_input = ModelInput(
        case_id=request.case_id,
        data=request.dict(exclude={"case_id"})
    )
    
    try:
        # Get the decision pipeline
        pipeline = model_manager.get_model("decision_pipeline")
        if not pipeline:
            raise HTTPException(status_code=503, detail="Decision pipeline not available")
        
        # Execute analysis
        result = await pipeline.predict(model_input)
        
        # Store context for future chat interactions
        background_tasks.add_task(
            context_manager.store_analysis_context,
            request.case_id,
            request.dict(),
            result.prediction
        )
        
        # Format response
        return AnalysisResponse(
            analysis_id=result.prediction_id,
            case_id=request.case_id,
            timestamp=result.timestamp,
            final_decision=result.prediction["final_decision"],
            confidence_score=result.confidence,
            risk_assessment=result.prediction["risk_assessment"],
            recommendations=result.prediction["recommendations"],
            compliance_status=result.prediction["compliance_status"],
            required_actions=result.prediction["required_actions"],
            stage_results=result.prediction["stage_results"],
            explanation=result.explanation
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/quick/{model_name}")
async def quick_analysis(
    model_name: str,
    request: QuickAnalysisRequest,
    model_manager = Depends(get_model_manager)
):
    """
    Perform quick analysis using a specific model.
    """
    # Get the requested model
    model = model_manager.get_model(model_name)
    if not model:
        raise HTTPException(status_code=404, detail=f"Model {model_name} not found")
    
    # Create model input
    model_input = ModelInput(
        case_id=request.case_id,
        data=request.data
    )
    
    try:
        # Execute prediction
        result = await model.predict(model_input)
        
        return {
            "model": model_name,
            "case_id": request.case_id,
            "prediction": result.prediction,
            "confidence": result.confidence,
            "explanation": result.explanation,
            "processing_time_ms": result.processing_time_ms
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/history/{case_id}")
async def get_analysis_history(
    case_id: str,
    context_manager = Depends(get_context_manager)
):
    """
    Get analysis history for a specific case.
    """
    history = await context_manager.get_case_history(case_id)
    
    if not history:
        raise HTTPException(status_code=404, detail=f"No history found for case {case_id}")
    
    return history


@router.post("/batch")
async def batch_analysis(
    cases: List[CaseAnalysisRequest],
    background_tasks: BackgroundTasks,
    model_manager = Depends(get_model_manager)
):
    """
    Analyze multiple cases in batch.
    """
    if len(cases) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 cases per batch")
    
    # Queue batch analysis
    batch_id = str(uuid.uuid4())
    background_tasks.add_task(
        process_batch_analysis,
        batch_id,
        cases,
        model_manager
    )
    
    return {
        "batch_id": batch_id,
        "status": "queued",
        "total_cases": len(cases),
        "message": "Batch analysis started. Use batch_id to check status."
    }


async def process_batch_analysis(
    batch_id: str,
    cases: List[CaseAnalysisRequest],
    model_manager
):
    """
    Process batch analysis in the background.
    """
    # Implementation would process cases and store results
    # This is a placeholder for the actual implementation
    pass