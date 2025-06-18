# AUSTA Cockpit - Project Setup Guide

## Project Structure

```
QualityControl/
├── src/
│   ├── components/      # React components
│   ├── services/        # API services and external integrations
│   ├── utils/           # Utility functions and helpers
│   ├── types/           # TypeScript type definitions
│   ├── hooks/           # Custom React hooks
│   ├── store/           # Redux store and slices
│   ├── assets/          # Static assets (images, fonts, etc.)
│   ├── App.tsx          # Main application component
│   ├── main.tsx         # Application entry point
│   └── index.css        # Global styles
├── public/              # Public static files
├── tests/               # Test files and setup
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite configuration
├── tailwind.config.js   # Tailwind CSS configuration
├── jest.config.js       # Jest testing configuration
├── .eslintrc.json       # ESLint configuration
└── .prettierrc.json     # Prettier configuration
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

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run test` - Run tests
- `npm run test:coverage` - Run tests with coverage
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

- **tsconfig.json** - TypeScript configuration with path aliases
- **vite.config.ts** - Vite configuration with React plugin
- **tailwind.config.js** - Tailwind CSS with dark mode support
- **jest.config.js** - Jest configuration for testing
- **.eslintrc.json** - ESLint rules for code quality
- **.prettierrc.json** - Prettier formatting rules

## Next Steps

1. Implement authentication system
2. Create dashboard components
3. Set up API integration services
4. Implement AI chat interface
5. Add real-time case updates
6. Create analytics visualizations

## Development Guidelines

- Use TypeScript for all new code
- Follow ESLint and Prettier rules
- Write tests for critical functionality
- Use Tailwind CSS for styling
- Implement responsive design
- Support dark mode throughout