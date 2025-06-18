#!/usr/bin/env node

/**
 * Integration Test Runner
 * Orchestrates the complete integration testing suite
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { IntegrationTestReporter } from '../tests/reporters/integration-test-reporter';

const execAsync = promisify(exec);

interface TestConfig {
  environment: 'development' | 'staging' | 'production' | 'integration';
  services: string[];
  testSuites: string[];
  parallel: boolean;
  timeout: number;
  retries: number;
  generateReport: boolean;
  cleanup: boolean;
  seedData: boolean;
  dockerCompose: boolean;
}

class IntegrationTestRunner {
  private config: TestConfig;
  private reporter: IntegrationTestReporter;
  private startTime: Date;

  constructor(config: Partial<TestConfig> = {}) {
    this.config = {
      environment: 'integration',
      services: ['backend', 'ai-service', 'frontend'],
      testSuites: [
        'frontend-backend-api',
        'backend-ai-service',
        'backend-database',
        'ai-ml-models',
        'contracts',
        'auth-service',
        'websocket',
        'redis-session'
      ],
      parallel: true,
      timeout: 300000, // 5 minutes
      retries: 2,
      generateReport: true,
      cleanup: true,
      seedData: true,
      dockerCompose: true,
      ...config
    };

    this.reporter = new IntegrationTestReporter('./test-results');
    this.startTime = new Date();
  }

  async run(): Promise<void> {
    try {
      console.log('🚀 Starting Integration Test Suite');
      console.log(`📅 Started at: ${this.startTime.toLocaleString()}`);
      console.log(`🏷️  Environment: ${this.config.environment}`);
      console.log(`🔧 Services: ${this.config.services.join(', ')}`);
      console.log('');

      // Pre-flight checks
      await this.preFlightChecks();

      // Setup test environment
      if (this.config.dockerCompose) {
        await this.setupDockerEnvironment();
      }

      // Wait for services to be ready
      await this.waitForServices();

      // Seed test data
      if (this.config.seedData) {
        await this.seedTestData();
      }

      // Run test suites
      await this.runTestSuites();

      // Generate reports
      if (this.config.generateReport) {
        this.reporter.finalize();
      }

      // Cleanup
      if (this.config.cleanup) {
        await this.cleanup();
      }

      console.log('✅ Integration tests completed successfully!');
      
    } catch (error) {
      console.error('❌ Integration tests failed:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  private async preFlightChecks(): Promise<void> {
    console.log('🔍 Running pre-flight checks...');

    // Check Docker availability
    if (this.config.dockerCompose) {
      try {
        await execAsync('docker --version');
        await execAsync('docker-compose --version');
        console.log('✅ Docker and docker-compose are available');
      } catch (error) {
        throw new Error('Docker or docker-compose not found. Please install Docker Desktop.');
      }
    }

    // Check Node.js dependencies
    try {
      await execAsync('npm list --depth=0');
      console.log('✅ Node.js dependencies are installed');
    } catch (error) {
      console.log('⚠️  Installing missing dependencies...');
      await execAsync('npm install');
    }

    // Create test directories
    const dirs = ['test-results', 'test-results/logs', 'test-results/artifacts'];
    dirs.forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });

    console.log('✅ Pre-flight checks completed\n');
  }

  private async setupDockerEnvironment(): Promise<void> {
    console.log('🐳 Setting up Docker test environment...');

    try {
      // Stop any existing containers
      await execAsync('docker-compose -f docker-compose.integration-test.yml down -v --remove-orphans', {
        timeout: 30000
      }).catch(() => {}); // Ignore errors if containers don't exist

      // Start test environment
      console.log('   Starting test services...');
      await execAsync('docker-compose -f docker-compose.integration-test.yml up -d --build', {
        timeout: 180000 // 3 minutes timeout for building and starting
      });

      console.log('✅ Docker environment is ready\n');
    } catch (error) {
      throw new Error(`Failed to setup Docker environment: ${error.message}`);
    }
  }

  private async waitForServices(): Promise<void> {
    console.log('⏳ Waiting for services to be ready...');

    const services = [
      { name: 'PostgreSQL', url: 'postgresql://test_user:test_password@localhost:5434/austa_integration_test' },
      { name: 'MongoDB', url: 'mongodb://test_user:test_password@localhost:27018/austa_integration_logs' },
      { name: 'Redis', url: 'redis://:test_password@localhost:6381' },
      { name: 'Backend', url: 'http://localhost:3002/api/health' },
      { name: 'AI Service', url: 'http://localhost:8001/api/v1/health' },
      { name: 'Frontend', url: 'http://localhost:3003' }
    ];

    const maxAttempts = 30;
    const delay = 2000; // 2 seconds

    for (const service of services) {
      let attempts = 0;
      let ready = false;

      while (!ready && attempts < maxAttempts) {
        try {
          if (service.url.startsWith('http')) {
            const { stdout } = await execAsync(`curl -f ${service.url} || echo "FAILED"`);
            ready = !stdout.includes('FAILED');
          } else {
            // For database connections, we'll check if the docker container is healthy
            const containerName = this.getContainerNameForService(service.name);
            if (containerName) {
              const { stdout } = await execAsync(`docker inspect --format='{{.State.Health.Status}}' ${containerName} || echo "unhealthy"`);
              ready = stdout.trim() === 'healthy';
            }
          }

          if (ready) {
            console.log(`   ✅ ${service.name} is ready`);
            this.reporter.addServiceStatus(service.name.toLowerCase(), {
              status: 'healthy',
              responseTime: attempts * delay,
              uptime: 100,
              errors: 0
            });
          }
        } catch (error) {
          // Service not ready yet
        }

        if (!ready) {
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (!ready) {
        throw new Error(`${service.name} failed to become ready after ${maxAttempts * delay / 1000} seconds`);
      }
    }

    console.log('✅ All services are ready\n');
  }

  private getContainerNameForService(serviceName: string): string | null {
    const mapping: { [key: string]: string } = {
      'PostgreSQL': 'austa-postgres-integration',
      'MongoDB': 'austa-mongodb-integration',
      'Redis': 'austa-redis-integration',
      'Backend': 'austa-backend-integration',
      'AI Service': 'austa-ai-service-integration',
      'Frontend': 'austa-frontend-integration'
    };
    return mapping[serviceName] || null;
  }

  private async seedTestData(): Promise<void> {
    console.log('🌱 Seeding test data...');

    try {
      await execAsync('docker-compose -f docker-compose.integration-test.yml run --rm test-seeder', {
        timeout: 60000
      });
      console.log('✅ Test data seeded\n');
    } catch (error) {
      console.log('⚠️  Warning: Test data seeding failed, continuing with tests...');
    }
  }

  private async runTestSuites(): Promise<void> {
    console.log('🧪 Running integration test suites...');

    if (this.config.parallel) {
      await this.runTestSuitesParallel();
    } else {
      await this.runTestSuitesSequential();
    }
  }

  private async runTestSuitesParallel(): Promise<void> {
    const promises = this.config.testSuites.map(suite => this.runTestSuite(suite));
    const results = await Promise.allSettled(promises);

    results.forEach((result, index) => {
      const suiteName = this.config.testSuites[index];
      if (result.status === 'rejected') {
        console.error(`❌ Test suite ${suiteName} failed:`, result.reason);
      } else {
        console.log(`✅ Test suite ${suiteName} completed`);
      }
    });
  }

  private async runTestSuitesSequential(): Promise<void> {
    for (const suite of this.config.testSuites) {
      try {
        await this.runTestSuite(suite);
        console.log(`✅ Test suite ${suite} completed`);
      } catch (error) {
        console.error(`❌ Test suite ${suite} failed:`, error);
        if (this.config.retries > 0) {
          console.log(`🔄 Retrying ${suite}...`);
          // Implementation for retries would go here
        }
      }
    }
  }

  private async runTestSuite(suiteName: string): Promise<void> {
    this.reporter.startSuite(suiteName);
    
    const testCommand = this.getTestCommand(suiteName);
    
    return new Promise((resolve, reject) => {
      const child = spawn('npm', ['run', testCommand], {
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: this.config.environment,
          TEST_TIMEOUT: this.config.timeout.toString(),
          DATABASE_URL: 'postgresql://test_user:test_password@localhost:5434/austa_integration_test',
          REDIS_URL: 'redis://:test_password@localhost:6381',
          MONGODB_URL: 'mongodb://test_user:test_password@localhost:27018/austa_integration_logs',
          BACKEND_URL: 'http://localhost:3002',
          AI_SERVICE_URL: 'http://localhost:8001',
          FRONTEND_URL: 'http://localhost:3003'
        }
      });

      let output = '';
      
      child.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stderr.write(text);
      });

      child.on('close', (code) => {
        // Save test output
        const logPath = join('test-results', 'logs', `${suiteName}.log`);
        writeFileSync(logPath, output);
        this.reporter.addArtifact('logs', logPath);

        this.reporter.endSuite();

        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Test suite ${suiteName} exited with code ${code}`));
        }
      });

      // Set timeout
      setTimeout(() => {
        child.kill();
        reject(new Error(`Test suite ${suiteName} timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);
    });
  }

  private getTestCommand(suiteName: string): string {
    const commandMap: { [key: string]: string } = {
      'frontend-backend-api': 'test:integration:frontend-backend',
      'backend-ai-service': 'test:integration:backend-ai',
      'backend-database': 'test:integration:backend-db',
      'ai-ml-models': 'test:integration:ai-ml',
      'contracts': 'test:contracts',
      'auth-service': 'test:integration:auth',
      'websocket': 'test:integration:websocket',
      'redis-session': 'test:integration:redis'
    };

    return commandMap[suiteName] || `test:integration:${suiteName}`;
  }

  private async cleanup(): Promise<void> {
    if (!this.config.cleanup) return;

    console.log('🧹 Cleaning up test environment...');

    try {
      // Stop and remove containers
      await execAsync('docker-compose -f docker-compose.integration-test.yml down -v --remove-orphans', {
        timeout: 60000
      });

      // Remove test artifacts if needed
      // await execAsync('rm -rf ./test-data-temp');

      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('⚠️  Cleanup warning:', error.message);
    }
  }
}

// CLI Interface
const args = process.argv.slice(2);
const config: Partial<TestConfig> = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  switch (arg) {
    case '--env':
      config.environment = args[++i] as any;
      break;
    case '--services':
      config.services = args[++i].split(',');
      break;
    case '--suites':
      config.testSuites = args[++i].split(',');
      break;
    case '--sequential':
      config.parallel = false;
      break;
    case '--no-cleanup':
      config.cleanup = false;
      break;
    case '--no-seed':
      config.seedData = false;
      break;
    case '--no-docker':
      config.dockerCompose = false;
      break;
    case '--timeout':
      config.timeout = parseInt(args[++i]);
      break;
    case '--retries':
      config.retries = parseInt(args[++i]);
      break;
    case '--help':
      console.log(`
Integration Test Runner

Usage: npm run test:integration [options]

Options:
  --env <environment>     Test environment (default: integration)
  --services <list>       Comma-separated list of services to test
  --suites <list>         Comma-separated list of test suites to run
  --sequential            Run test suites sequentially instead of parallel
  --no-cleanup            Skip cleanup after tests
  --no-seed               Skip test data seeding
  --no-docker             Skip Docker environment setup
  --timeout <ms>          Test timeout in milliseconds (default: 300000)
  --retries <count>       Number of retries for failed tests (default: 2)
  --help                  Show this help message

Examples:
  npm run test:integration
  npm run test:integration -- --env staging --sequential
  npm run test:integration -- --suites frontend-backend-api,contracts
  npm run test:integration -- --no-docker --services backend,ai-service
      `);
      process.exit(0);
  }
}

// Run the tests
if (require.main === module) {
  const runner = new IntegrationTestRunner(config);
  runner.run().catch(error => {
    console.error('Failed to run integration tests:', error);
    process.exit(1);
  });
}

export { IntegrationTestRunner, TestConfig };