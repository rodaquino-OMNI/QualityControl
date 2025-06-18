# Contributing to AUSTA Cockpit

Thank you for your interest in contributing to AUSTA Cockpit! This document provides guidelines and information for contributors.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Coding Standards](#coding-standards)
5. [Testing Guidelines](#testing-guidelines)
6. [Documentation Standards](#documentation-standards)
7. [Pull Request Process](#pull-request-process)
8. [Issue Reporting](#issue-reporting)
9. [Security Reporting](#security-reporting)
10. [Release Process](#release-process)

## Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, sex characteristics, gender identity and expression, level of experience, education, socio-economic status, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

Examples of behavior that contributes to creating a positive environment include:

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

### Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be reported by contacting the project team at conduct@austa.com.br.

## Getting Started

### Prerequisites

Before contributing, please ensure you have:

1. **Read the documentation**:
   - [Development Setup Guide](docs/development/SETUP.md)
   - [Architecture Documentation](docs/architecture/README.md)
   - [API Documentation](docs/api/README.md)

2. **Set up your development environment**:
   ```bash
   git clone https://github.com/austa/cockpit.git
   cd austa-cockpit
   npm install
   npm run dev
   ```

3. **Join our communication channels**:
   - Slack: [austa-cockpit.slack.com](https://austa-cockpit.slack.com)
   - Discussions: [GitHub Discussions](https://github.com/austa/cockpit/discussions)

### Your First Contribution

Looking for a good first issue? Check out:
- [Good First Issues](https://github.com/austa/cockpit/labels/good%20first%20issue)
- [Help Wanted](https://github.com/austa/cockpit/labels/help%20wanted)
- [Documentation](https://github.com/austa/cockpit/labels/documentation)

## Development Workflow

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/cockpit.git
cd cockpit

# Add the original repository as upstream
git remote add upstream https://github.com/austa/cockpit.git
```

### 2. Create a Feature Branch

```bash
# Update your local main branch
git checkout main
git pull upstream main

# Create a new feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/issue-description

# Or for documentation
git checkout -b docs/what-youre-documenting
```

### 3. Make Your Changes

- Follow our [coding standards](#coding-standards)
- Write or update tests as needed
- Update documentation
- Keep commits atomic and well-described

### 4. Test Your Changes

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Run linting
npm run lint

# Run type checking
npm run typecheck

# Test the build
npm run build
```

### 5. Commit Your Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Examples of good commit messages
git commit -m "feat(auth): add multi-factor authentication support"
git commit -m "fix(api): resolve case assignment validation error"
git commit -m "docs(setup): update development environment guide"
git commit -m "test(cases): add unit tests for case filtering"
git commit -m "refactor(components): improve LoadingSpinner performance"
```

**Commit Types**:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

### 6. Push and Create Pull Request

```bash
# Push your changes
git push origin feature/your-feature-name

# Create a pull request on GitHub
```

## Coding Standards

### TypeScript/JavaScript

We use ESLint and Prettier for code formatting. Configuration is in `.eslintrc.js` and `.prettierrc`.

**Key Rules**:

1. **Use TypeScript for all new code**:
   ```typescript
   // Good
   interface User {
     id: string;
     email: string;
     role: UserRole;
   }
   
   const createUser = (userData: Partial<User>): Promise<User> => {
     // Implementation
   };
   
   // Bad
   const createUser = (userData) => {
     // Implementation
   };
   ```

2. **Use meaningful names**:
   ```typescript
   // Good
   const handleCaseSubmission = async (caseData: CaseData) => {
     const validatedData = validateCaseData(caseData);
     return await caseService.createCase(validatedData);
   };
   
   // Bad
   const handleSubmit = async (data) => {
     const d = validate(data);
     return await service.create(d);
   };
   ```

3. **Error handling**:
   ```typescript
   // Good
   try {
     const result = await riskyOperation();
     return result;
   } catch (error) {
     logger.error('Operation failed', { error, context });
     throw new ServiceError('Failed to complete operation', error);
   }
   
   // Bad
   const result = await riskyOperation();
   return result;
   ```

4. **Use async/await over Promises**:
   ```typescript
   // Good
   const fetchUserData = async (userId: string): Promise<User> => {
     const user = await userRepository.findById(userId);
     const permissions = await permissionService.getPermissions(userId);
     return { ...user, permissions };
   };
   
   // Bad
   const fetchUserData = (userId: string): Promise<User> => {
     return userRepository.findById(userId)
       .then(user => permissionService.getPermissions(userId)
         .then(permissions => ({ ...user, permissions })));
   };
   ```

### React Components

1. **Use functional components with hooks**:
   ```tsx
   // Good
   interface CaseListProps {
     cases: Case[];
     onCaseSelect: (case: Case) => void;
   }
   
   export const CaseList: React.FC<CaseListProps> = ({ cases, onCaseSelect }) => {
     const [selectedCase, setSelectedCase] = useState<Case | null>(null);
     
     const handleCaseClick = useCallback((case: Case) => {
       setSelectedCase(case);
       onCaseSelect(case);
     }, [onCaseSelect]);
     
     return (
       <div className="case-list">
         {cases.map(case => (
           <CaseItem 
             key={case.id} 
             case={case} 
             onClick={handleCaseClick}
             isSelected={selectedCase?.id === case.id}
           />
         ))}
       </div>
     );
   };
   ```

2. **Component file structure**:
   ```
   components/
   ├── CaseList/
   │   ├── index.ts              # Export file
   │   ├── CaseList.tsx          # Main component
   │   ├── CaseList.test.tsx     # Tests
   │   ├── CaseList.stories.tsx  # Storybook stories
   │   └── types.ts              # Component-specific types
   ```

3. **Props interface naming**:
   ```typescript
   // Component props should end with 'Props'
   interface CaseListProps {
     // props
   }
   
   // Event handler props should start with 'on'
   interface ButtonProps {
     onClick?: (event: MouseEvent) => void;
     onSubmit?: (data: FormData) => void;
   }
   ```

### CSS/Styling

We use Tailwind CSS with custom components for styling:

1. **Use Tailwind utilities first**:
   ```tsx
   // Good
   <div className="flex items-center justify-between p-4 bg-white rounded-lg shadow-md">
     <h2 className="text-lg font-semibold text-gray-900">Title</h2>
     <button className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700">
       Action
     </button>
   </div>
   ```

2. **Create reusable component classes for complex patterns**:
   ```css
   /* components.css */
   .card {
     @apply bg-white rounded-lg shadow-md p-6;
   }
   
   .btn-primary {
     @apply px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2;
   }
   ```

3. **Use CSS modules for component-specific styles**:
   ```css
   /* CaseList.module.css */
   .container {
     @apply grid gap-4;
     grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
   }
   
   .item {
     @apply p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow;
   }
   
   .item[data-selected='true'] {
     @apply border-blue-500 bg-blue-50;
   }
   ```

### Backend Code

1. **Service layer pattern**:
   ```typescript
   // Good - Service layer
   class CaseService {
     constructor(
       private caseRepository: CaseRepository,
       private auditService: AuditService,
       private aiService: AIService
     ) {}
     
     async createCase(caseData: CreateCaseData, userId: string): Promise<Case> {
       // Validation
       const validatedData = await this.validateCaseData(caseData);
       
       // Business logic
       const case = await this.caseRepository.create({
         ...validatedData,
         createdBy: userId,
         status: CaseStatus.PENDING
       });
       
       // Side effects
       await this.auditService.logCaseCreation(case, userId);
       await this.aiService.queueAnalysis(case.id);
       
       return case;
     }
   }
   ```

2. **Controller pattern**:
   ```typescript
   // Good - Controller
   class CaseController {
     constructor(private caseService: CaseService) {}
     
     @Post('/')
     @ValidateBody(CreateCaseSchema)
     async createCase(
       @Body() caseData: CreateCaseData,
       @CurrentUser() user: User
     ): Promise<ApiResponse<Case>> {
       try {
         const case = await this.caseService.createCase(caseData, user.id);
         return {
           success: true,
           data: case,
           message: 'Case created successfully'
         };
       } catch (error) {
         if (error instanceof ValidationError) {
           throw new BadRequestException(error.message);
         }
         throw error;
       }
     }
   }
   ```

3. **Database queries**:
   ```typescript
   // Good - Repository pattern with Prisma
   class CaseRepository {
     async findWithFilters(filters: CaseFilters): Promise<Case[]> {
       return await prisma.case.findMany({
         where: {
           status: filters.status,
           priority: filters.priority,
           assignedTo: filters.assignedTo,
           createdAt: {
             gte: filters.startDate,
             lte: filters.endDate
           }
         },
         include: {
           assignedUser: {
             select: { id: true, name: true, email: true }
           },
           decisions: {
             orderBy: { createdAt: 'desc' },
             take: 1
           }
         },
         orderBy: [
           { priority: 'desc' },
           { createdAt: 'desc' }
         ]
       });
     }
   }
   ```

## Testing Guidelines

### Test Structure

We follow the AAA pattern (Arrange, Act, Assert):

```typescript
describe('CaseService', () => {
  describe('createCase', () => {
    it('should create a case with valid data', async () => {
      // Arrange
      const caseData: CreateCaseData = {
        patientId: 'patient-123',
        procedureCode: '12345678',
        requestedValue: 250.00,
        priority: Priority.MEDIUM
      };
      const userId = 'user-123';
      
      const mockCase = { id: 'case-123', ...caseData };
      jest.spyOn(caseRepository, 'create').mockResolvedValue(mockCase);
      
      // Act
      const result = await caseService.createCase(caseData, userId);
      
      // Assert
      expect(result).toEqual(mockCase);
      expect(caseRepository.create).toHaveBeenCalledWith({
        ...caseData,
        createdBy: userId,
        status: CaseStatus.PENDING
      });
    });
    
    it('should throw ValidationError for invalid data', async () => {
      // Arrange
      const invalidCaseData = {
        patientId: 'invalid-id',
        procedureCode: '123', // Too short
        requestedValue: -100 // Negative value
      };
      
      // Act & Assert
      await expect(caseService.createCase(invalidCaseData, 'user-123'))
        .rejects.toThrow(ValidationError);
    });
  });
});
```

### Unit Tests

Focus on testing individual functions and components:

```typescript
// Component testing
import { render, screen, fireEvent } from '@testing-library/react';
import { CaseList } from './CaseList';

describe('CaseList', () => {
  const mockCases = [
    { id: '1', title: 'Case 1', status: 'pending' },
    { id: '2', title: 'Case 2', status: 'approved' }
  ];
  
  it('renders all cases', () => {
    render(<CaseList cases={mockCases} onCaseSelect={jest.fn()} />);
    
    expect(screen.getByText('Case 1')).toBeInTheDocument();
    expect(screen.getByText('Case 2')).toBeInTheDocument();
  });
  
  it('calls onCaseSelect when case is clicked', () => {
    const handleCaseSelect = jest.fn();
    render(<CaseList cases={mockCases} onCaseSelect={handleCaseSelect} />);
    
    fireEvent.click(screen.getByText('Case 1'));
    
    expect(handleCaseSelect).toHaveBeenCalledWith(mockCases[0]);
  });
});
```

### Integration Tests

Test interactions between components:

```typescript
describe('Case Management Integration', () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });
  
  afterEach(async () => {
    await cleanupTestDatabase();
  });
  
  it('should create case and trigger AI analysis', async () => {
    // Arrange
    const app = await createTestApp();
    const authToken = await getAuthToken('auditor');
    
    const caseData = {
      patientId: 'patient-123',
      procedureCode: '12345678',
      requestedValue: 250.00
    };
    
    // Act
    const response = await request(app)
      .post('/api/v1/cases')
      .set('Authorization', `Bearer ${authToken}`)
      .send(caseData)
      .expect(201);
    
    // Assert
    expect(response.body.data).toMatchObject(caseData);
    
    // Verify AI analysis was queued
    const queueJobs = await getQueueJobs('ai-analysis');
    expect(queueJobs).toHaveLength(1);
    expect(queueJobs[0].data.caseId).toBe(response.body.data.id);
  });
});
```

### E2E Tests

Test complete user workflows:

```typescript
// Using Playwright
import { test, expect } from '@playwright/test';

test.describe('Case Management Workflow', () => {
  test('auditor can create and approve a case', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'auditor@austa.com.br');
    await page.fill('[data-testid=password]', 'password123');
    await page.click('[data-testid=login-button]');
    
    // Navigate to cases
    await page.click('[data-testid=nav-cases]');
    await expect(page).toHaveURL('/cases');
    
    // Create new case
    await page.click('[data-testid=new-case-button]');
    await page.fill('[data-testid=patient-id]', 'patient-123');
    await page.fill('[data-testid=procedure-code]', '12345678');
    await page.fill('[data-testid=requested-value]', '250.00');
    await page.click('[data-testid=save-case]');
    
    // Verify case was created
    await expect(page.locator('[data-testid=case-list]')).toContainText('patient-123');
    
    // Open case for review
    await page.click('[data-testid=case-item]:first-child');
    
    // Wait for AI analysis
    await expect(page.locator('[data-testid=ai-analysis]')).toBeVisible();
    
    // Make decision
    await page.click('[data-testid=approve-button]');
    await page.fill('[data-testid=justification]', 'Meets all clinical guidelines');
    await page.click('[data-testid=confirm-decision]');
    
    // Verify decision was recorded
    await expect(page.locator('[data-testid=case-status]')).toHaveText('Approved');
  });
});
```

## Documentation Standards

### Code Documentation

1. **JSDoc for functions and classes**:
   ```typescript
   /**
    * Creates a new medical authorization case
    * @param caseData - The case data to create
    * @param userId - ID of the user creating the case
    * @returns Promise resolving to the created case
    * @throws {ValidationError} When case data is invalid
    * @throws {AuthorizationError} When user lacks permissions
    */
   async createCase(caseData: CreateCaseData, userId: string): Promise<Case> {
     // Implementation
   }
   ```

2. **Component documentation**:
   ```tsx
   /**
    * CaseList component displays a list of medical authorization cases
    * 
    * @example
    * ```tsx
    * <CaseList 
    *   cases={cases} 
    *   onCaseSelect={handleCaseSelect}
    *   filter={{ status: 'pending' }}
    * />
    * ```
    */
   interface CaseListProps {
     /** Array of cases to display */
     cases: Case[];
     /** Callback fired when a case is selected */
     onCaseSelect: (case: Case) => void;
     /** Optional filter to apply to the list */
     filter?: CaseFilter;
   }
   ```

### API Documentation

Update OpenAPI spec when adding new endpoints:

```yaml
# Add to docs/api/openapi.yaml
/api/v1/cases/{caseId}/assign:
  post:
    tags:
      - Cases
    summary: Assign case to auditor
    description: Assign or reassign a case to an auditor
    parameters:
      - name: caseId
        in: path
        required: true
        schema:
          type: string
          format: uuid
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - auditorId
            properties:
              auditorId:
                type: string
                format: uuid
    responses:
      '200':
        description: Case assigned successfully
```

### README Updates

Update relevant README files when adding new features:

- Update main README.md for major features
- Update component READMEs for new components
- Update API documentation for new endpoints

## Pull Request Process

### Before Submitting

1. **Ensure your branch is up to date**:
   ```bash
   git checkout main
   git pull upstream main
   git checkout your-feature-branch
   git rebase main
   ```

2. **Run the full test suite**:
   ```bash
   npm run test:all
   npm run lint
   npm run typecheck
   npm run build
   ```

3. **Update documentation**:
   - Add/update JSDoc comments
   - Update README if needed
   - Update API docs for new endpoints
   - Add Storybook stories for new components

### Pull Request Template

Use this template for your PR description:

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Related Issues
Fixes #(issue number)
Related to #(issue number)

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Manual testing completed

## Screenshots (if applicable)
Add screenshots of UI changes

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published
```

### Review Process

1. **Automated checks** must pass:
   - All tests
   - Code quality checks
   - Security scans
   - Build verification

2. **Code review** by team members:
   - At least one approval from a team member
   - For significant changes, approval from a senior developer
   - For security-related changes, approval from security team

3. **Final checks**:
   - Ensure branch is up to date with main
   - Squash commits if needed
   - Verify CI/CD pipeline passes

## Issue Reporting

### Bug Reports

Use this template for bug reports:

```markdown
**Bug Description**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected Behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment**
- OS: [e.g. macOS 12.0]
- Browser: [e.g. Chrome 95.0]
- Node.js version: [e.g. 18.17.0]
- Version: [e.g. 1.2.3]

**Additional Context**
Add any other context about the problem here.
```

### Feature Requests

Use this template for feature requests:

```markdown
**Is your feature request related to a problem?**
A clear and concise description of what the problem is.

**Describe the solution you'd like**
A clear and concise description of what you want to happen.

**Describe alternatives you've considered**
A clear and concise description of any alternative solutions or features you've considered.

**Additional context**
Add any other context or screenshots about the feature request here.

**Acceptance Criteria**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
```

## Security Reporting

**Do not report security vulnerabilities through public GitHub issues.**

Instead, please email security-reports@austa.com.br with:

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if you have one)

We will respond within 24 hours and provide a timeline for resolution.

## Release Process

### Version Numbers

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version: Incompatible API changes
- **MINOR** version: New functionality (backward compatible)
- **PATCH** version: Bug fixes (backward compatible)

### Release Checklist

1. **Prepare release**:
   ```bash
   # Update version
   npm version major|minor|patch
   
   # Update CHANGELOG.md
   # Update documentation
   ```

2. **Create release PR**:
   - Update version numbers
   - Update changelog
   - Update documentation

3. **Deploy to staging**:
   - Test all functionality
   - Run security scans
   - Performance testing

4. **Create release**:
   - Merge release PR
   - Tag release
   - Deploy to production
   - Monitor metrics

## Getting Help

If you need help or have questions:

1. **Check existing documentation**
2. **Search existing issues** on GitHub
3. **Ask in Slack** (#dev-help channel)
4. **Create a discussion** on GitHub
5. **Email the team** at dev-support@austa.com.br

## Recognition

Contributors are recognized in:
- CONTRIBUTORS.md file
- Release notes
- Annual contributor report
- Project website

Thank you for contributing to AUSTA Cockpit!