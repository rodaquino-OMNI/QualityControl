"""
Data Validators
"""
from typing import Dict, Any, List, Optional
import re
from datetime import datetime


def validate_case_data(data: Dict[str, Any]) -> Optional[List[str]]:
    """Validate case data and return list of errors if any."""
    errors = []
    
    # Validate patient age
    age = data.get("patient_age")
    if age is not None:
        if not isinstance(age, int) or age < 0 or age > 150:
            errors.append("Invalid patient age")
    
    # Validate gender
    gender = data.get("patient_gender")
    if gender and gender not in ["M", "F", "O"]:
        errors.append("Invalid gender. Must be M, F, or O")
    
    # Validate procedure code format
    procedure_code = data.get("procedure_code", "")
    if not re.match(r"^[A-Z0-9]{3,}$", procedure_code):
        errors.append("Invalid procedure code format")
    
    # Validate diagnosis code (ICD format)
    diagnosis_code = data.get("diagnosis_code", "")
    if not re.match(r"^[A-Z][0-9]{2}(\.[0-9]{1,2})?$", diagnosis_code):
        errors.append("Invalid diagnosis code format (ICD)")
    
    # Validate cost
    cost = data.get("cost_requested")
    if cost is not None:
        if not isinstance(cost, (int, float)) or cost < 0:
            errors.append("Invalid cost requested")
    
    # Validate urgency level
    urgency = data.get("urgency_level")
    if urgency and urgency not in ["routine", "urgent", "emergency"]:
        errors.append("Invalid urgency level")
    
    # Validate treatment history
    treatment_history = data.get("treatment_history", [])
    if treatment_history:
        for i, record in enumerate(treatment_history[:5]):  # Check first 5
            if not isinstance(record, dict):
                errors.append(f"Treatment history record {i} must be a dictionary")
            elif "date" not in record or "procedure_code" not in record:
                errors.append(f"Treatment history record {i} missing required fields")
    
    return errors if errors else None


def validate_chat_message(message: str) -> Optional[str]:
    """Validate chat message."""
    if not message or not message.strip():
        return "Message cannot be empty"
    
    if len(message) > 2000:
        return "Message too long (max 2000 characters)"
    
    return None


def validate_model_name(model_name: str) -> bool:
    """Validate model name format."""
    valid_models = [
        "bert_medical",
        "gpt4_medical",
        "xgboost_fraud",
        "lstm_patterns",
        "decision_pipeline"
    ]
    return model_name in valid_models


def sanitize_input(text: str) -> str:
    """Sanitize text input."""
    # Remove control characters
    text = re.sub(r'[\x00-\x1F\x7F-\x9F]', '', text)
    # Normalize whitespace
    text = ' '.join(text.split())
    return text.strip()


def validate_date_format(date_str: str) -> bool:
    """Validate date format (ISO 8601)."""
    try:
        datetime.fromisoformat(date_str)
        return True
    except ValueError:
        return False