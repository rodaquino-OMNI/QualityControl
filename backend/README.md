# AUSTA Cockpit Backend API

RESTful API backend for AUSTA Cockpit - Medical Audit Platform with AI Integration.

## Architecture

The backend follows a layered architecture:

- **Routes**: HTTP endpoint definitions with OpenAPI documentation
- **Controllers**: Request handling and response formatting
- **Services**: Business logic and external integrations
- **Middleware**: Cross-cutting concerns (auth, validation, logging)
- **Models**: Database schema using Prisma ORM
- **Utils**: Shared utilities and helpers

## Key Features

- **RESTful API** with OpenAPI/Swagger documentation
- **JWT Authentication** with refresh tokens
- **Role-based Access Control** (RBAC)
- **AI Integration** for medical case analysis
- **Real-time Notifications** via WebSockets
- **Job Queues** with Bull/Redis
- **Audit Trail** for compliance
- **Rate Limiting** and API key management
- **Health Checks** for monitoring

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Queue**: Bull
- **Authentication**: JWT
- **Validation**: Express Validator + Joi
- **Documentation**: Swagger/OpenAPI
- **Logging**: Winston + Pino
- **Testing**: Jest + Supertest

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run migrate

# Seed database (optional)
npm run seed
```

### Development

```bash
# Start development server with hot reload
npm run dev

# Run in watch mode
npm run dev:watch
```

### Production

```bash
# Build TypeScript
npm run build

# Start production server
npm start

# With PM2
pm2 start ecosystem.config.js
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout user
- `GET /api/v1/auth/me` - Get current user

### Cases
- `GET /api/v1/cases` - List cases with filters
- `GET /api/v1/cases/:id` - Get case details
- `POST /api/v1/cases` - Create new case
- `PATCH /api/v1/cases/:id/status` - Update case status
- `POST /api/v1/cases/:id/assign` - Assign case to auditor

### Decisions
- `POST /api/v1/decisions` - Create decision
- `GET /api/v1/decisions/:id` - Get decision details
- `GET /api/v1/decisions` - List decisions
- `POST /api/v1/decisions/:id/appeal` - Create appeal

### AI Services
- `POST /api/v1/ai/analyze/:caseId` - Request AI analysis
- `POST /api/v1/ai/chat` - Chat with AI assistant
- `POST /api/v1/ai/fraud-detection/:caseId` - Run fraud detection
- `GET /api/v1/ai/similar-cases/:caseId` - Find similar cases

### Analytics
- `GET /api/v1/analytics/dashboard` - Dashboard metrics
- `GET /api/v1/analytics/metrics/auditor` - Auditor performance
- `GET /api/v1/analytics/fraud-analysis` - Fraud analytics
- `POST /api/v1/analytics/reports/generate` - Generate reports

### Notifications
- `GET /api/v1/notifications` - Get user notifications
- `PATCH /api/v1/notifications/:id/read` - Mark as read
- `GET /api/v1/notifications/preferences` - Get preferences
- `PUT /api/v1/notifications/preferences` - Update preferences

### Audit
- `GET /api/v1/audit/trail` - Get audit trail
- `GET /api/v1/audit/compliance-report` - Compliance report
- `GET /api/v1/audit/export` - Export audit data

### Health
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health status
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Secret for JWT signing
- `AI_SERVICE_URL` - AI service endpoint
- `OPENAI_API_KEY` - OpenAI API key for GPT-4

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

## API Documentation

Swagger documentation is available at:
- Development: http://localhost:3000/api-docs
- Production: https://api.austa.com.br/api-docs

## Security

- All endpoints require authentication (except health checks)
- JWT tokens expire after 24 hours
- Refresh tokens expire after 7 days
- API keys for external access with rate limiting
- Input validation on all endpoints
- SQL injection protection via Prisma
- XSS protection via Helmet
- CORS configured for allowed origins

## Monitoring

- Health endpoints for Kubernetes probes
- Prometheus metrics endpoint
- Structured logging with correlation IDs
- Performance tracking on all database queries
- Error tracking with Sentry

## Deployment

### Docker

```bash
# Build image
docker build -t austa/cockpit-api .

# Run container
docker run -p 3000:3000 --env-file .env austa/cockpit-api
```

### Kubernetes

```bash
# Apply manifests
kubectl apply -f k8s/

# Check deployment
kubectl get pods -n austa-system
```

## Contributing

1. Create feature branch: `git checkout -b feature/amazing-feature`
2. Commit changes: `git commit -m 'Add amazing feature'`
3. Push branch: `git push origin feature/amazing-feature`
4. Open Pull Request

## License

MIT License - see LICENSE file for details