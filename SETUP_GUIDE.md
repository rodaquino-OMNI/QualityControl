# AUSTA Cockpit - Installation and Setup Guide

This comprehensive guide covers all aspects of installing and setting up the AUSTA Cockpit platform, including prerequisites, installation steps, common issues and their solutions, and instructions for running and testing the application.

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Quick Setup Steps](#2-quick-setup-steps)
3. [Common Issues and Fixes](#3-common-issues-and-fixes)
4. [How to Run and Test the Application](#4-how-to-run-and-test-the-application)
5. [Troubleshooting](#5-troubleshooting)

## 1. Prerequisites

### System Requirements
- **Operating System**: macOS, Linux, or Windows with WSL2
- **RAM**: Minimum 8GB (16GB recommended for development)
- **Storage**: At least 10GB free disk space
- **CPU**: Multi-core processor recommended

### Required Software

#### Core Dependencies
1. **Node.js** (v20.0.0 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version`

2. **Python** (v3.11 or higher)
   - Download from [python.org](https://python.org/)
   - Verify installation: `python --version`

3. **Docker & Docker Compose**
   - Download from [docker.com](https://docker.com/)
   - Verify installation: 
     ```bash
     docker --version
     docker-compose --version
     ```

4. **Git**
   - Download from [git-scm.com](https://git-scm.com/)
   - Verify installation: `git --version`

#### Database Requirements
5. **PostgreSQL** (v15 or higher)
   - Download from [postgresql.org](https://postgresql.org/)
   - Required for local development without Docker

6. **Redis** (v7 or higher)
   - Download from [redis.io](https://redis.io/)
   - Required for local development without Docker

### Development Tools (Optional but Recommended)
- **VS Code** with extensions:
  - ESLint
  - Prettier
  - TypeScript and JavaScript Language Features
  - Docker
  - Python
- **Postman** or similar API testing tool
- **Redis Desktop Manager** for Redis GUI
- **pgAdmin** for PostgreSQL GUI

## 2. Quick Setup Steps

### Option A: Docker Setup (Recommended)

This is the fastest way to get the application running with all dependencies.

```bash
# 1. Clone the repository
git clone https://github.com/austa/cockpit.git
cd QualityControl

# 2. Create environment files from examples
cp .env.example .env
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env

# 3. Update environment variables (see Configuration section below)
# Edit the .env files with your preferred editor

# 4. Start all services with Docker Compose
docker-compose up -d

# 5. Wait for services to be healthy (check with)
docker-compose ps

# 6. Run database migrations
docker-compose exec backend npm run prisma:migrate

# 7. (Optional) Seed the database with sample data
docker-compose exec backend npm run seed

# 8. Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
# AI Service: http://localhost:8000
```

### Option B: Manual Setup (For Development)

Use this approach when you need more control over individual services.

#### Step 1: Install Node.js Dependencies

```bash
# Clone the repository
git clone https://github.com/austa/cockpit.git
cd QualityControl

# Install root dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..

# Install backend dependencies
cd backend
npm install
npm run prisma:generate
cd ..
```

#### Step 2: Install Python Dependencies

```bash
# Navigate to AI service
cd ai-service

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt
cd ..
```

#### Step 3: Setup Databases

##### PostgreSQL Setup
```bash
# macOS with Homebrew
brew install postgresql@15
brew services start postgresql

# Ubuntu/Debian
sudo apt update
sudo apt install postgresql-15 postgresql-contrib
sudo systemctl start postgresql

# Create database and user
sudo -u postgres psql
```

In PostgreSQL prompt:
```sql
CREATE USER austa WITH PASSWORD 'austa123';
CREATE DATABASE austa_cockpit OWNER austa;
GRANT ALL PRIVILEGES ON DATABASE austa_cockpit TO austa;
\q
```

##### Redis Setup
```bash
# macOS with Homebrew
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis-server

# Test Redis connection
redis-cli ping
# Should return: PONG
```

#### Step 4: Configure Environment Variables

Create `.env` files from the examples:
```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env
```

Update the following key variables in each file:

**Root `.env`:**
```env
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3001
VITE_ENV=development
```

**Backend `.env`:**
```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://austa:austa123@localhost:5432/austa_cockpit
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-secure-jwt-secret-here
```

**AI Service `.env`:**
```env
ENVIRONMENT=development
DATABASE_URL=postgresql://austa:austa123@localhost:5432/austa_cockpit
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=your-api-key-here
```

#### Step 5: Run Database Migrations

```bash
cd backend
npm run prisma:migrate
npm run prisma:generate
cd ..
```

#### Step 6: Start the Services

Open separate terminal windows for each service:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run start
```

**Terminal 3 - AI Service:**
```bash
cd ai-service
source venv/bin/activate  # or venv\Scripts\activate on Windows
python -m uvicorn app.main:app --reload --port 8000
```

## 3. Common Issues and Fixes

### Issue 1: Port Already in Use

**Error:** `Error: listen EADDRINUSE: address already in use :::3000`

**Solution:**
```bash
# Find process using the port
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Kill the process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows

# Or change the port in .env file
PORT=3002
```

### Issue 2: Database Connection Failed

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution:**
1. Ensure PostgreSQL is running:
   ```bash
   # Check status
   systemctl status postgresql  # Linux
   brew services list  # macOS
   
   # Start if needed
   sudo systemctl start postgresql  # Linux
   brew services start postgresql  # macOS
   ```

2. Verify connection details in `.env`:
   ```env
   DATABASE_URL=postgresql://austa:austa123@localhost:5432/austa_cockpit
   ```

3. Test connection:
   ```bash
   psql -U austa -d austa_cockpit -h localhost
   ```

### Issue 3: Redis Connection Error

**Error:** `Error: Redis connection to localhost:6379 failed`

**Solution:**
1. Start Redis service:
   ```bash
   redis-server  # Start manually
   # or
   brew services start redis  # macOS
   sudo systemctl start redis  # Linux
   ```

2. Test Redis connection:
   ```bash
   redis-cli ping
   ```

### Issue 4: Node Module Issues

**Error:** `Cannot find module` or `Module not found`

**Solution:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# For specific service
cd frontend  # or backend
rm -rf node_modules package-lock.json
npm install
```

### Issue 5: TypeScript Compilation Errors

**Error:** TypeScript compilation errors

**Solution:**
```bash
# Check TypeScript version
npm list typescript

# Run type checking
npm run typecheck

# Clean build
rm -rf dist
npm run build
```

### Issue 6: Docker Compose Issues

**Error:** `docker-compose: command not found`

**Solution:**
```bash
# Install Docker Compose
# For Docker Desktop, it's included
# For Linux:
sudo apt install docker-compose  # Ubuntu/Debian
sudo yum install docker-compose  # CentOS/RHEL
```

**Error:** `Cannot connect to the Docker daemon`

**Solution:**
```bash
# Start Docker daemon
sudo systemctl start docker  # Linux
# Open Docker Desktop on macOS/Windows

# Add user to docker group (Linux)
sudo usermod -aG docker $USER
# Log out and back in
```

### Issue 7: Python Virtual Environment Issues

**Error:** `No module named 'venv'`

**Solution:**
```bash
# Install python3-venv
sudo apt install python3.11-venv  # Ubuntu/Debian
# or use pip
pip install virtualenv
virtualenv venv
```

### Issue 8: Prisma Migration Errors

**Error:** `Error: P1001: Can't reach database server`

**Solution:**
1. Ensure database exists:
   ```bash
   psql -U postgres -c "CREATE DATABASE austa_cockpit;"
   ```

2. Reset Prisma:
   ```bash
   cd backend
   npx prisma migrate reset --force
   npx prisma generate
   npx prisma migrate dev
   ```

## 4. How to Run and Test the Application

### Running the Application

#### Development Mode
```bash
# Using Docker (all services)
docker-compose up

# Manual (separate terminals)
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm start

# Terminal 3: AI Service
cd ai-service && python -m uvicorn app.main:app --reload
```

#### Production Mode
```bash
# Build for production
npm run build

# Using Docker
docker-compose -f docker-compose.prod.yml up -d

# Manual
cd backend && npm run build && npm start
cd frontend && npm run build && npm run serve
```

### Testing the Application

#### Unit Tests
```bash
# Run all tests
npm test

# Frontend tests
cd frontend
npm test
npm run test:coverage

# Backend tests
cd backend
npm test
npm run test:unit
npm run test:integration

# AI Service tests
cd ai-service
pytest
pytest --cov=app
```

#### E2E Tests
```bash
# Ensure application is running first

# Run Cypress tests
npm run cypress:open  # Interactive mode
npm run cypress:run   # Headless mode
```

#### API Testing
```bash
# Health check endpoints
curl http://localhost:3001/health
curl http://localhost:8000/health

# Test authentication
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@austa.com","password":"admin123"}'
```

### Monitoring and Logs

#### View Docker Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f ai-service
```

#### Application Logs
- Backend logs: `backend/logs/`
- AI Service logs: `ai-service/logs/`
- Frontend logs: Browser console

### Database Management

#### Access PostgreSQL
```bash
# Via psql
psql -U austa -d austa_cockpit

# Via Docker
docker-compose exec postgres psql -U austa -d austa_cockpit

# Using pgAdmin (if profile enabled)
# Access at: http://localhost:5050
# Email: admin@austa.com
# Password: admin123
```

#### Access Redis
```bash
# Via redis-cli
redis-cli

# Via Docker
docker-compose exec redis redis-cli

# Using Redis Commander (if profile enabled)
# Access at: http://localhost:8081
```

## 5. Troubleshooting

### General Debugging Steps

1. **Check Service Status:**
   ```bash
   docker-compose ps  # Docker
   ps aux | grep node  # Node processes
   ps aux | grep python  # Python processes
   ```

2. **Check Logs:**
   ```bash
   # Docker logs
   docker-compose logs -f [service-name]
   
   # Application logs
   tail -f backend/logs/error.log
   tail -f ai-service/logs/app.log
   ```

3. **Verify Network Connectivity:**
   ```bash
   # Test endpoints
   curl -I http://localhost:3000  # Frontend
   curl -I http://localhost:3001/health  # Backend
   curl -I http://localhost:8000/health  # AI Service
   ```

4. **Reset Everything:**
   ```bash
   # Stop all services
   docker-compose down -v
   
   # Clean everything
   rm -rf node_modules backend/node_modules frontend/node_modules
   rm -rf backend/dist frontend/dist
   
   # Reinstall and restart
   npm install
   docker-compose up --build
   ```

### Getting Help

If you encounter issues not covered in this guide:

1. Check the [project documentation](./Docs/)
2. Review [GitHub issues](https://github.com/austa/cockpit/issues)
3. Contact support: suporte@austa.com.br
4. Join Slack: [austa-cockpit.slack.com](https://austa-cockpit.slack.com)

### Performance Optimization Tips

1. **Enable Docker BuildKit:**
   ```bash
   export DOCKER_BUILDKIT=1
   docker-compose build
   ```

2. **Allocate More Resources to Docker:**
   - Docker Desktop → Settings → Resources
   - Increase CPU and Memory limits

3. **Use Production Builds:**
   ```bash
   NODE_ENV=production npm run build
   ```

4. **Enable Redis Persistence:**
   ```bash
   # In redis.conf
   appendonly yes
   appendfsync everysec
   ```

---

**Note:** This guide assumes you're working with the AUSTA Cockpit platform. Always refer to the latest documentation and ensure you have the necessary permissions and API keys before starting development.