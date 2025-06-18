# AUSTA AI Service

AI Service for Medical Audit Decision Support - Part of AUSTA Cockpit Platform

## Overview

The AI Service provides intelligent analysis of medical audit cases using multiple AI models:

- **BERT Medical**: Medical text analysis and entity recognition
- **GPT-4 Medical**: Expert review and interactive chat assistance
- **XGBoost Fraud**: Fraud detection and risk assessment
- **LSTM Patterns**: Treatment pattern analysis and anomaly detection
- **Decision Pipeline**: Orchestrates all models for comprehensive analysis

## Architecture

```
ai-service/
├── app/                    # FastAPI application
│   ├── main.py            # Main application entry
│   └── routers/           # API endpoints
├── models/                # AI model implementations
│   ├── base.py           # Base model interfaces
│   ├── bert_medical.py   # BERT medical model
│   ├── gpt4_medical.py   # GPT-4 integration
│   ├── xgboost_fraud.py  # Fraud detection
│   ├── lstm_patterns.py  # Pattern analysis
│   └── decision_pipeline.py # Model orchestration
├── services/              # Business logic services
│   ├── model_manager.py  # Model lifecycle management
│   ├── context_manager.py # Context and history management
│   └── chat_service.py   # Chat interaction service
├── config/               # Configuration
│   ├── settings.py      # Application settings
│   └── ai_models.yaml   # Model configurations
└── utils/               # Utilities
    ├── validators.py    # Data validation
    └── middleware.py    # Custom middleware
```

## Features

### 1. Comprehensive Case Analysis
- Multi-model analysis pipeline
- Confidence scoring and explanations
- Risk assessment and fraud detection
- Compliance checking

### 2. Interactive AI Chat
- Context-aware conversations
- Case-specific assistance
- Smart question suggestions
- Real-time WebSocket support

### 3. Model Management
- Dynamic model loading/unloading
- Performance monitoring
- Version control
- A/B testing support

### 4. Context Management
- Case history tracking
- Conversation memory
- Redis-backed persistence
- TTL-based cleanup

## API Endpoints

### Health Check
- `GET /health` - Basic health check
- `GET /health/readiness` - Service readiness
- `GET /health/liveness` - Service liveness
- `GET /health/system` - System metrics

### Model Management
- `GET /models` - List available models
- `GET /models/{model_name}` - Get model info
- `POST /models/{model_name}/load` - Load a model
- `POST /models/{model_name}/unload` - Unload a model

### Analysis
- `POST /analysis/audit` - Full pipeline analysis
- `POST /analysis/quick/{model_name}` - Single model analysis
- `GET /analysis/history/{case_id}` - Get case history
- `POST /analysis/batch` - Batch analysis

### Chat
- `POST /chat/message` - Send chat message
- `GET /chat/history/{case_id}` - Get chat history
- `DELETE /chat/context/{case_id}` - Clear context
- `WS /chat/ws/{case_id}` - WebSocket chat
- `POST /chat/suggestions/{case_id}` - Get suggestions

## Quick Start

### Prerequisites
- Python 3.11+
- Docker & Docker Compose
- OpenAI API Key

### Local Development

1. Clone the repository
```bash
cd ai-service
```

2. Create environment file
```bash
cp .env.example .env
# Edit .env with your configurations
```

3. Install dependencies
```bash
pip install -r requirements.txt
```

4. Run with Docker Compose
```bash
docker-compose up -d
```

5. Access the service
- API: http://localhost:8001
- Docs: http://localhost:8001/docs
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000

### Manual Run

```bash
# Set environment variables
export OPENAI_API_KEY="your-key"
export DATABASE_URL="postgresql://..."
export REDIS_URL="redis://..."

# Run the service
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

## Configuration

### Environment Variables

```env
# API Configuration
API_PORT=8001
API_HOST=0.0.0.0
ENVIRONMENT=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/austa_ai
REDIS_URL=redis://localhost:6379/0

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_TEMPERATURE=0.3

# Model Endpoints
BERT_MEDICAL_ENDPOINT=http://localhost:8002/bert-medical
XGBOOST_FRAUD_ENDPOINT=http://localhost:8003/fraud-detection
LSTM_PATTERN_ENDPOINT=http://localhost:8004/pattern-analysis

# Security
JWT_SECRET_KEY=your-secret-key
ENCRYPTION_KEY=your-encryption-key
```

### Model Configuration

Edit `config/ai_models.yaml` to configure model parameters:

```yaml
models:
  bert-medical:
    name: "BERT Medical Portuguese"
    version: "3.2.0"
    max_tokens: 512
    confidence_threshold: 0.85
    
  gpt-4-medical:
    name: "GPT-4 Medical Assistant"
    temperature: 0.3
    max_tokens: 2000
    system_prompt: "..."
```

## Usage Examples

### 1. Analyze a Medical Case

```bash
curl -X POST http://localhost:8001/analysis/audit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "case_id": "CASE-2024-001",
    "patient_age": 45,
    "patient_gender": "M",
    "procedure_code": "0010101",
    "procedure_description": "Cirurgia cardíaca",
    "diagnosis_code": "I21.0",
    "diagnosis_description": "Infarto agudo do miocárdio",
    "medical_text": "Paciente com histórico de...",
    "cost_requested": 50000.00,
    "urgency_level": "urgent"
  }'
```

### 2. Chat About a Case

```bash
curl -X POST http://localhost:8001/chat/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "case_id": "CASE-2024-001",
    "message": "Quais são os principais riscos identificados neste caso?"
  }'
```

### 3. Quick Analysis with Specific Model

```bash
curl -X POST http://localhost:8001/analysis/quick/xgboost_fraud \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "data": {
      "cost_requested": 50000,
      "procedure_code": "0010101",
      "provider_info": {
        "monthly_claims": 150,
        "average_monthly_claims": 50
      }
    }
  }'
```

## Monitoring

### Metrics
- Request count and duration
- Model performance metrics
- Cache hit rates
- Error rates

### Logging
- Structured JSON logging
- Log levels: DEBUG, INFO, WARNING, ERROR
- Centralized logging with ELK stack

### Health Checks
- Liveness probe: `/health/liveness`
- Readiness probe: `/health/readiness`
- System metrics: `/health/system`

## Security

### Authentication
- JWT token authentication
- API key support
- Role-based access control

### Data Protection
- Input validation and sanitization
- Encrypted communication (TLS)
- Secure model serving

### Rate Limiting
- Per-user rate limits
- Configurable thresholds
- Graceful degradation

## Development

### Testing
```bash
# Run tests
pytest

# With coverage
pytest --cov=app --cov=models --cov=services

# Run specific test
pytest tests/test_models.py::test_bert_medical
```

### Code Quality
```bash
# Format code
black .

# Lint
flake8

# Type checking
mypy .
```

### Contributing
1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

## Deployment

### Docker
```bash
# Build image
docker build -t austa/ai-service:latest .

# Run container
docker run -p 8001:8001 --env-file .env austa/ai-service:latest
```

### Kubernetes
```bash
# Apply configurations
kubectl apply -f k8s/

# Check status
kubectl get pods -n austa-system
```

## Troubleshooting

### Common Issues

1. **Model loading fails**
   - Check model files exist
   - Verify sufficient memory
   - Check model configurations

2. **Chat context not found**
   - Ensure case was analyzed first
   - Check Redis connection
   - Verify case ID format

3. **Slow response times**
   - Monitor model loading times
   - Check Redis performance
   - Enable response caching

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=DEBUG
uvicorn app.main:app --log-level debug
```

## License

Copyright © 2024 AUSTA Health Tech. All rights reserved.