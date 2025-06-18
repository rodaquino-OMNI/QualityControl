"""
AI Service Configuration Settings
"""
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings."""
    
    # API Configuration
    api_port: int = Field(default=8001, env="API_PORT")
    api_host: str = Field(default="0.0.0.0", env="API_HOST")
    environment: str = Field(default="development", env="ENVIRONMENT")
    
    # Database
    database_url: str = Field(env="DATABASE_URL")
    redis_url: str = Field(env="REDIS_URL")
    
    # OpenAI Configuration
    openai_api_key: str = Field(env="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4-turbo-preview", env="OPENAI_MODEL")
    openai_temperature: float = Field(default=0.3, env="OPENAI_TEMPERATURE")
    openai_max_tokens: int = Field(default=2000, env="OPENAI_MAX_TOKENS")
    
    # Model Endpoints
    bert_medical_endpoint: str = Field(env="BERT_MEDICAL_ENDPOINT")
    xgboost_fraud_endpoint: str = Field(env="XGBOOST_FRAUD_ENDPOINT")
    lstm_pattern_endpoint: str = Field(env="LSTM_PATTERN_ENDPOINT")
    
    # Model Configuration
    bert_max_tokens: int = Field(default=512, env="BERT_MAX_TOKENS")
    bert_confidence_threshold: float = Field(default=0.85, env="BERT_CONFIDENCE_THRESHOLD")
    fraud_detection_threshold: float = Field(default=0.7, env="FRAUD_DETECTION_THRESHOLD")
    pattern_analysis_window: int = Field(default=30, env="PATTERN_ANALYSIS_WINDOW")
    
    # Security
    jwt_secret_key: str = Field(env="JWT_SECRET_KEY")
    encryption_key: str = Field(env="ENCRYPTION_KEY")
    
    # Monitoring
    sentry_dsn: Optional[str] = Field(default=None, env="SENTRY_DSN")
    prometheus_port: int = Field(default=9090, env="PROMETHEUS_PORT")
    
    # Logging
    log_level: str = Field(default="INFO", env="LOG_LEVEL")
    log_format: str = Field(default="json", env="LOG_FORMAT")
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Create settings instance
settings = Settings()