# Development Setup Guide

This guide will help you set up the AUSTA Cockpit development environment on your local machine.

## Prerequisites

### System Requirements

- **Operating System**: macOS, Linux, or Windows (with WSL2)
- **Memory**: Minimum 8GB RAM (16GB recommended)
- **Storage**: At least 10GB free space
- **Processor**: Multi-core processor recommended

### Required Software

1. **Node.js** (v20.0.0 or higher)
   ```bash
   # Check version
   node --version
   
   # Install via nvm (recommended)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 20
   nvm use 20
   ```

2. **Python** (v3.11 or higher)
   ```bash
   # Check version
   python --version
   
   # Install via pyenv (recommended)
   curl https://pyenv.run | bash
   pyenv install 3.11.0
   pyenv global 3.11.0
   ```

3. **Docker & Docker Compose**
   - [Docker Desktop](https://www.docker.com/products/docker-desktop/) for Mac/Windows
   - Or install via package manager on Linux

4. **PostgreSQL** (v15 or higher)
   ```bash
   # macOS
   brew install postgresql@15
   
   # Ubuntu/Debian
   sudo apt-get install postgresql-15
   ```

5. **Redis** (v7 or higher)
   ```bash
   # macOS
   brew install redis
   
   # Ubuntu/Debian
   sudo apt-get install redis-server
   ```

6. **Git**
   ```bash
   # Check version
   git --version
   ```

## Project Setup

### 1. Clone the Repository

```bash
git clone https://github.com/austa/cockpit.git
cd austa-cockpit
```

### 2. Environment Configuration

Create environment files for each service:

#### Root `.env` file
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# General
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://austa:password@localhost:5432/austa_cockpit
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this
SESSION_SECRET=your-session-secret-key-change-this

# AI Services
OPENAI_API_KEY=sk-your-openai-api-key
AI_SERVICE_URL=http://localhost:8000

# Security
ENCRYPTION_KEY=your-32-character-encryption-key
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# External Services (Optional for development)
SENTRY_DSN=
PROMETHEUS_ENDPOINT=
BLOCKCHAIN_RPC_URL=
CONTRACT_ADDRESS=
```

#### Backend `.env` file
```bash
cd backend
cp .env.example .env
```

#### AI Service `.env` file
```bash
cd ../ai-service
cp .env.example .env
```

Add AI-specific configuration:
```env
# Model Configuration
BERT_MODEL_PATH=./models/bert-medical
GPT4_API_KEY=${OPENAI_API_KEY}
FRAUD_MODEL_PATH=./models/xgboost-fraud

# Service Configuration
HOST=0.0.0.0
PORT=8000
WORKERS=4

# Cache
REDIS_URL=redis://localhost:6379/1
```

### 3. Database Setup

#### Create PostgreSQL Database
```bash
# Access PostgreSQL
psql -U postgres

# Create database and user
CREATE USER austa WITH PASSWORD 'password';
CREATE DATABASE austa_cockpit OWNER austa;
GRANT ALL PRIVILEGES ON DATABASE austa_cockpit TO austa;
\q
```

#### Run Migrations
```bash
cd backend
npm install
npm run migrate
```

#### Seed Development Data (Optional)
```bash
npm run seed
```

### 4. Install Dependencies

#### Frontend Dependencies
```bash
cd frontend
npm install
```

#### Backend Dependencies
```bash
cd ../backend
npm install
npm run generate  # Generate Prisma client
```

#### AI Service Dependencies
```bash
cd ../ai-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 5. Download AI Models

```bash
# From ai-service directory
python scripts/download_models.py
```

This will download:
- BERT Medical model (~500MB)
- XGBoost Fraud Detection model (~100MB)
- Other required models

## Running the Application

### Option 1: Using Docker Compose (Recommended)

```bash
# From project root
docker-compose up -d
```

This starts all services:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- AI Service: http://localhost:8000
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### Option 2: Running Services Individually

#### Terminal 1: Backend
```bash
cd backend
npm run dev
```

#### Terminal 2: Frontend
```bash
cd frontend
npm run dev
```

#### Terminal 3: AI Service
```bash
cd ai-service
source venv/bin/activate
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Terminal 4: Redis
```bash
redis-server
```

## Development Tools

### VS Code Extensions

Install recommended extensions:
```bash
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension ms-python.python
code --install-extension ms-vscode.vscode-typescript-tslint-plugin
code --install-extension prisma.prisma
code --install-extension bradlc.vscode-tailwindcss
```

### Git Hooks

We use Husky for Git hooks:
```bash
npm run prepare  # Sets up Husky
```

This enables:
- Pre-commit: Linting and formatting
- Pre-push: Type checking and tests

### Code Quality Tools

#### Linting
```bash
# Frontend
cd frontend && npm run lint

# Backend
cd backend && npm run lint

# AI Service
cd ai-service && flake8 app/
```

#### Type Checking
```bash
# TypeScript
npm run typecheck

# Python
cd ai-service && mypy app/
```

#### Formatting
```bash
# JavaScript/TypeScript
npm run format

# Python
cd ai-service && black app/
```

## Testing

### Running Tests

#### Frontend Tests
```bash
cd frontend
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage
```

#### Backend Tests
```bash
cd backend
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage
```

#### AI Service Tests
```bash
cd ai-service
pytest                   # Run all tests
pytest -v               # Verbose output
pytest --cov=app        # With coverage
```

### E2E Tests
```bash
# From project root
npm run test:e2e
```

## Common Development Tasks

### Adding a New API Endpoint

1. **Define the route** in `backend/src/routes/`
2. **Create controller** in `backend/src/controllers/`
3. **Add service logic** in `backend/src/services/`
4. **Update Prisma schema** if needed
5. **Run migration**: `npm run migrate`
6. **Add tests** in `backend/tests/`
7. **Update API documentation**

### Adding a New React Component

1. **Create component** in `frontend/src/components/`
2. **Add TypeScript types** in `frontend/src/types/`
3. **Create tests** in same directory
4. **Add to Storybook** if applicable
5. **Update component documentation**

### Adding a New AI Model

1. **Add model files** to `ai-service/models/`
2. **Create service** in `ai-service/services/`
3. **Add endpoint** in `ai-service/app/api/`
4. **Update configuration** in `ai-service/config/`
5. **Add tests** in `ai-service/tests/`

## Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

#### 2. Database Connection Failed
```bash
# Check PostgreSQL status
pg_isready

# Restart PostgreSQL
brew services restart postgresql  # macOS
sudo systemctl restart postgresql  # Linux
```

#### 3. Redis Connection Failed
```bash
# Check Redis status
redis-cli ping

# Start Redis
redis-server
```

#### 4. Node Modules Issues
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

#### 5. Python Virtual Environment Issues
```bash
# Recreate virtual environment
rm -rf venv
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Debug Mode

#### Frontend Debugging
1. Open Chrome DevTools
2. Go to Sources tab
3. Set breakpoints in TypeScript files

#### Backend Debugging
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/backend/src/index.ts",
      "preLaunchTask": "tsc: build - backend/tsconfig.json",
      "outFiles": ["${workspaceFolder}/backend/dist/**/*.js"]
    }
  ]
}
```

#### AI Service Debugging
```bash
# Run with debugger
python -m debugpy --listen 5678 --wait-for-client -m uvicorn app.main:app --reload
```

## Performance Optimization

### Development Performance

1. **Use SWC instead of TSC** for faster builds:
   ```json
   // tsconfig.json
   {
     "ts-node": {
       "transpileOnly": true,
       "transpiler": "ts-node/transpilers/swc"
     }
   }
   ```

2. **Enable React Fast Refresh**:
   Already configured in Vite

3. **Use Redis for session storage**:
   Configured by default

### Database Performance

1. **Create indexes**:
   ```sql
   CREATE INDEX idx_cases_status ON cases(status);
   CREATE INDEX idx_cases_assigned_to ON cases(assigned_to);
   CREATE INDEX idx_cases_created_at ON cases(created_at DESC);
   ```

2. **Enable query logging** in development:
   ```typescript
   // backend/src/config/database.ts
   const prisma = new PrismaClient({
     log: ['query', 'info', 'warn', 'error'],
   });
   ```

## Next Steps

1. **Read the Architecture Documentation** to understand the system design
2. **Review the API Documentation** for endpoint details
3. **Check the Component Documentation** for UI components
4. **Join the Development Slack** for team communication
5. **Review open issues** on GitHub to find tasks

## Getting Help

- **Documentation**: [docs.austa.com.br](https://docs.austa.com.br)
- **Slack**: [austa-cockpit.slack.com](https://austa-cockpit.slack.com)
- **Email**: dev-support@austa.com.br
- **GitHub Issues**: [github.com/austa/cockpit/issues](https://github.com/austa/cockpit/issues)