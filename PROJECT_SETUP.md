# AUSTA Cockpit - Project Setup Guide

## Project Structure

```
QualityControl/
├── frontend/            # Frontend React application
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── services/    # API services and external integrations
│   │   ├── utils/       # Utility functions and helpers
│   │   ├── types/       # TypeScript type definitions
│   │   ├── hooks/       # Custom React hooks
│   │   ├── store/       # Redux store and slices
│   │   ├── assets/      # Static assets (images, fonts, etc.)
│   │   ├── App.tsx      # Main application component
│   │   ├── main.tsx     # Application entry point
│   │   └── index.css    # Global styles
│   ├── public/          # Public static files
│   ├── package.json     # Frontend dependencies
│   ├── tsconfig.json    # Frontend TypeScript config
│   └── vite.config.ts   # Vite configuration
├── backend/             # Backend Node.js/Express API
│   ├── src/
│   │   ├── controllers/ # Request handlers
│   │   ├── services/    # Business logic
│   │   ├── middleware/  # Express middleware
│   │   ├── routes/      # API routes
│   │   ├── models/      # Data models
│   │   └── utils/       # Backend utilities
│   ├── prisma/          # Database schema and migrations
│   ├── package.json     # Backend dependencies
│   └── tsconfig.json    # Backend TypeScript config
├── ai-service/          # Python AI/ML service
│   ├── app/             # FastAPI application
│   ├── models/          # ML models
│   └── requirements.txt # Python dependencies
├── docker/              # Docker configuration files
├── db/                  # Database scripts and docs
├── monitoring/          # Monitoring and observability
├── tests/               # Root-level test files and setup
├── cypress/             # E2E test files
├── package.json         # Root dependencies and scripts
├── tsconfig.json        # Root TypeScript configuration
├── jest.config.js       # Root Jest testing configuration
├── .eslintrc.json       # ESLint configuration
└── docker-compose.yml   # Docker Compose configuration
```

## Installed Dependencies

### Core Dependencies
- **React 18.2.0** - UI library
- **TypeScript 5.0** - Type safety
- **Tailwind CSS 3.4** - Utility-first CSS framework
- **Redux Toolkit** - State management
- **React Router DOM** - Routing
- **Axios** - HTTP client
- **D3.js & Recharts** - Data visualization
- **React Query** - Server state management
- **Socket.io Client** - Real-time communication

### Development Dependencies
- **Vite** - Build tool and dev server
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Jest** - Testing framework
- **React Testing Library** - Component testing
- **Husky** - Git hooks

## Available Scripts

- `npm run dev` - Start development server (from root runs Vite)
- `npm run build` - Build all services for production
- `npm run build:frontend` - Build frontend only
- `npm run build:backend` - Build backend only
- `npm run preview` - Preview production build
- `npm run test` - Run unit tests
- `npm run test:coverage` - Run tests with coverage
- `npm run test:integration` - Run integration tests
- `npm run test:e2e` - Run end-to-end tests with Cypress
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Check TypeScript types

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

## Configuration Files

### Root Level
- **tsconfig.json** - Root TypeScript configuration with project references
- **tsconfig.node.json** - TypeScript config for Node.js build tools
- **jest.config.js** - Root Jest configuration for unit tests
- **jest.integration.config.js** - Configuration for integration tests
- **.eslintrc.json** - ESLint rules for code quality
- **tailwind.config.js** - Tailwind CSS with dark mode support
- **docker-compose.yml** - Docker services configuration

### Frontend Specific
- **frontend/tsconfig.json** - Frontend TypeScript configuration
- **frontend/vite.config.ts** - Vite configuration with React plugin
- **frontend/postcss.config.js** - PostCSS configuration

### Backend Specific
- **backend/tsconfig.json** - Backend TypeScript configuration
- **backend/jest.config.js** - Backend test configuration
- **backend/prisma/schema.prisma** - Database schema definition

## Next Steps

1. Set up development environment with Docker
2. Configure environment variables (copy .env.example to .env)
3. Run database migrations with Prisma
4. Start all services with docker-compose
5. Access the application:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - AI Service: http://localhost:8000
6. Run tests to ensure everything is working

## Development Guidelines

- Use TypeScript for all new code
- Follow ESLint and Prettier rules
- Write tests for critical functionality
- Use Tailwind CSS for styling
- Implement responsive design
- Support dark mode throughout