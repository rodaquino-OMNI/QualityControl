"""
Model management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any

from services.model_manager import get_model_manager


router = APIRouter()


@router.get("/")
async def list_models(model_manager = Depends(get_model_manager)) -> List[Dict[str, Any]]:
    """List all available models."""
    return model_manager.list_models()


@router.get("/{model_name}")
async def get_model_info(
    model_name: str,
    model_manager = Depends(get_model_manager)
) -> Dict[str, Any]:
    """Get information about a specific model."""
    model_info = model_manager.get_model_info(model_name)
    
    if not model_info:
        raise HTTPException(status_code=404, detail=f"Model {model_name} not found")
    
    return model_info


@router.post("/{model_name}/load")
async def load_model(
    model_name: str,
    model_manager = Depends(get_model_manager)
) -> Dict[str, str]:
    """Load a specific model."""
    try:
        await model_manager.load_model(model_name)
        return {"status": "success", "message": f"Model {model_name} loaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")


@router.post("/{model_name}/unload")
async def unload_model(
    model_name: str,
    model_manager = Depends(get_model_manager)
) -> Dict[str, str]:
    """Unload a specific model."""
    try:
        await model_manager.unload_model(model_name)
        return {"status": "success", "message": f"Model {model_name} unloaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to unload model: {str(e)}")


@router.post("/reload-all")
async def reload_all_models(
    model_manager = Depends(get_model_manager)
) -> Dict[str, Any]:
    """Reload all models."""
    try:
        results = await model_manager.reload_all_models()
        return {
            "status": "success",
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reload models: {str(e)}")