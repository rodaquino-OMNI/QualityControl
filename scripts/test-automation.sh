#!/bin/bash

# Test Automation Script
# Provides comprehensive test execution capabilities

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
TEST_SUITE="all"
ENVIRONMENT="test"
PARALLEL=true
COVERAGE=true
REPORT_FORMAT="html"
CLEAN_BEFORE=false
DOCKER_SERVICES=false
VERBOSE=false

# Usage information
usage() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Test Automation Options:"
  echo "  -s, --suite SUITE      Test suite to run (all|unit|integration|e2e|performance|security)"
  echo "  -e, --env ENV          Environment (test|staging|production)"
  echo "  -p, --parallel         Enable parallel execution (default: true)"
  echo "  -c, --coverage         Generate coverage reports (default: true)"
  echo "  -f, --format FORMAT    Report format (html|json|xml|text)"
  echo "  -d, --docker           Start Docker services"
  echo "  -k, --clean            Clean before running tests"
  echo "  -v, --verbose          Verbose output"
  echo "  -h, --help             Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 --suite unit --coverage"
  echo "  $0 --suite e2e --env staging --docker"
  echo "  $0 --suite all --parallel --format json"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -s|--suite)
      TEST_SUITE="$2"
      shift 2
      ;;
    -e|--env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    -p|--parallel)
      PARALLEL=true
      shift
      ;;
    -c|--coverage)
      COVERAGE=true
      shift
      ;;
    -f|--format)
      REPORT_FORMAT="$2"
      shift 2
      ;;
    -d|--docker)
      DOCKER_SERVICES=true
      shift
      ;;
    -k|--clean)
      CLEAN_BEFORE=true
      shift
      ;;
    -v|--verbose)
      VERBOSE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      usage
      exit 1
      ;;
  esac
done

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Cleanup function
cleanup() {
  if [ "$DOCKER_SERVICES" = true ]; then
    log_info "Stopping Docker services..."
    docker-compose -f docker-compose.test.yml down > /dev/null 2>&1 || true
  fi
}

# Trap cleanup on exit
trap cleanup EXIT

# Validate environment
validate_environment() {
  log_info "Validating environment..."
  
  if [ ! -f "package.json" ]; then
    log_error "package.json not found. Are you in the project root?"
    exit 1
  fi
  
  # Check Node.js
  if ! command_exists node; then
    log_error "Node.js is not installed"
    exit 1
  fi
  
  # Check Python for AI service
  if [ -d "ai-service" ] && ! command_exists python; then
    log_error "Python is not installed (required for ai-service)"
    exit 1
  fi
  
  # Check Docker if needed
  if [ "$DOCKER_SERVICES" = true ] && ! command_exists docker; then
    log_error "Docker is not installed"
    exit 1
  fi
  
  log_success "Environment validation passed"
}

# Start Docker services
start_docker_services() {
  if [ "$DOCKER_SERVICES" = true ]; then
    log_info "Starting Docker services..."
    if [ -f "docker-compose.test.yml" ]; then
      docker-compose -f docker-compose.test.yml up -d
      log_info "Waiting for services to be ready..."
      sleep 15
    else
      log_warning "docker-compose.test.yml not found, skipping Docker services"
    fi
  fi
}

# Clean previous runs
clean_previous_runs() {
  if [ "$CLEAN_BEFORE" = true ]; then
    log_info "Cleaning previous test runs..."
    
    # Clean coverage reports
    find . -name "coverage" -type d -exec rm -rf {} + 2>/dev/null || true
    find . -name "*.coverage" -type f -delete 2>/dev/null || true
    find . -name ".nyc_output" -type d -exec rm -rf {} + 2>/dev/null || true
    
    # Clean test artifacts
    find . -name "test-results" -type d -exec rm -rf {} + 2>/dev/null || true
    find . -name "cypress/screenshots" -type d -exec rm -rf {} + 2>/dev/null || true
    find . -name "cypress/videos" -type d -exec rm -rf {} + 2>/dev/null || true
    
    # Clean build artifacts
    find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
    find . -name "build" -type d -exec rm -rf {} + 2>/dev/null || true
    
    log_success "Cleanup completed"
  fi
}

# Install dependencies
install_dependencies() {
  log_info "Installing dependencies..."
  
  # Frontend dependencies
  if [ -d "frontend" ]; then
    log_info "Installing frontend dependencies..."
    cd frontend && npm ci && cd ..
  fi
  
  # Backend dependencies
  if [ -d "backend" ]; then
    log_info "Installing backend dependencies..."
    cd backend && npm ci && cd ..
  fi
  
  # AI Service dependencies
  if [ -d "ai-service" ]; then
    log_info "Installing AI service dependencies..."
    cd ai-service
    python -m pip install --upgrade pip
    pip install -r requirements.txt
    pip install -r requirements-dev.txt
    cd ..
  fi
  
  log_success "Dependencies installed"
}

# Run unit tests
run_unit_tests() {
  log_info "Running unit tests..."
  
  local exit_code=0
  
  # Frontend unit tests
  if [ -d "frontend" ]; then
    log_info "Running frontend unit tests..."
    cd frontend
    if [ "$COVERAGE" = true ]; then
      npm run test:coverage || exit_code=$?
    else
      npm run test || exit_code=$?
    fi
    cd ..
  fi
  
  # Backend unit tests
  if [ -d "backend" ]; then
    log_info "Running backend unit tests..."
    cd backend
    if [ "$COVERAGE" = true ]; then
      npm run test:coverage || exit_code=$?
    else
      npm run test:unit || exit_code=$?
    fi
    cd ..
  fi
  
  # AI Service unit tests
  if [ -d "ai-service" ]; then
    log_info "Running AI service unit tests..."
    cd ai-service
    if [ "$COVERAGE" = true ]; then
      python -m pytest -v -m unit --cov=app --cov-report=html --cov-report=xml || exit_code=$?
    else
      python -m pytest -v -m unit || exit_code=$?
    fi
    cd ..
  fi
  
  return $exit_code
}

# Run integration tests
run_integration_tests() {
  log_info "Running integration tests..."
  
  local exit_code=0
  
  # Backend integration tests
  if [ -d "backend" ]; then
    log_info "Running backend integration tests..."
    cd backend
    npm run test:integration || exit_code=$?
    cd ..
  fi
  
  # AI Service integration tests
  if [ -d "ai-service" ]; then
    log_info "Running AI service integration tests..."
    cd ai-service
    python -m pytest -v -m integration --cov=app --cov-report=xml --cov-append || exit_code=$?
    cd ..
  fi
  
  return $exit_code
}

# Run E2E tests
run_e2e_tests() {
  log_info "Running E2E tests..."
  
  local exit_code=0
  
  # Start application services
  log_info "Starting application services..."
  
  # Build frontend
  if [ -d "frontend" ]; then
    cd frontend && npm run build && cd ..
  fi
  
  # Start services in background
  if [ -d "backend" ]; then
    cd backend && npm run start &
    BACKEND_PID=$!
    cd ..
  fi
  
  if [ -d "ai-service" ]; then
    cd ai-service && uvicorn app.main:app --host 0.0.0.0 --port 8001 &
    AI_PID=$!
    cd ..
  fi
  
  if [ -d "frontend" ]; then
    cd frontend && npm run preview -- --port 3000 &
    FRONTEND_PID=$!
    cd ..
  fi
  
  # Wait for services
  log_info "Waiting for services to start..."
  sleep 30
  
  # Run Cypress tests
  if command_exists cypress; then
    if [ "$PARALLEL" = true ]; then
      npx cypress run --record --parallel || exit_code=$?
    else
      npx cypress run || exit_code=$?
    fi
  else
    log_warning "Cypress not found, skipping E2E tests"
  fi
  
  # Cleanup services
  [ -n "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null || true
  [ -n "$AI_PID" ] && kill $AI_PID 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null || true
  
  return $exit_code
}

# Run performance tests
run_performance_tests() {
  log_info "Running performance tests..."
  
  local exit_code=0
  
  if [ -d "performance-tests" ]; then
    cd performance-tests
    
    # Install Artillery if not present
    if ! command_exists artillery; then
      npm install -g artillery@latest
    fi
    
    # Run performance tests
    artillery run scripts/artillery/api-stress.yml --output api-performance.json || exit_code=$?
    artillery run scripts/artillery/auth-stress.yml --output auth-performance.json || exit_code=$?
    
    # Generate reports
    artillery report api-performance.json --output reports/api-report.html || true
    artillery report auth-performance.json --output reports/auth-report.html || true
    
    cd ..
  else
    log_warning "Performance tests directory not found"
  fi
  
  return $exit_code
}

# Run security tests
run_security_tests() {
  log_info "Running security tests..."
  
  local exit_code=0
  
  # Run npm audit
  log_info "Running npm audit..."
  if [ -d "frontend" ]; then
    cd frontend && npm audit --audit-level=moderate || exit_code=$?
    cd ..
  fi
  
  if [ -d "backend" ]; then
    cd backend && npm audit --audit-level=moderate || exit_code=$?
    cd ..
  fi
  
  # Run Python security checks
  if [ -d "ai-service" ]; then
    log_info "Running Python security checks..."
    cd ai-service
    pip install bandit safety
    bandit -r app -f json -o ../bandit-report.json || exit_code=$?
    safety check --json --output ../safety-report.json || exit_code=$?
    cd ..
  fi
  
  return $exit_code
}

# Generate comprehensive report
generate_report() {
  log_info "Generating test report..."
  
  mkdir -p test-reports
  
  {
    echo "# Test Results Report"
    echo "Generated: $(date)"
    echo ""
    echo "## Test Configuration"
    echo "- Suite: $TEST_SUITE"
    echo "- Environment: $ENVIRONMENT"
    echo "- Parallel: $PARALLEL"
    echo "- Coverage: $COVERAGE"
    echo "- Format: $REPORT_FORMAT"
    echo ""
    echo "## Results Summary"
    
    # Find coverage files and summarize
    find . -name "coverage-summary.json" | while read file; do
      if [ -f "$file" ]; then
        service=$(echo "$file" | cut -d'/' -f2)
        echo "- $service: Coverage data available"
      fi
    done
    
    echo ""
    echo "## Artifacts Generated"
    find test-reports -type f 2>/dev/null | while read file; do
      echo "- $file"
    done
    
  } > test-reports/summary.md
  
  log_success "Test report generated: test-reports/summary.md"
}

# Main execution function
main() {
  log_info "Starting test automation (Suite: $TEST_SUITE, Environment: $ENVIRONMENT)"
  
  validate_environment
  start_docker_services
  clean_previous_runs
  install_dependencies
  
  local overall_exit_code=0
  
  case $TEST_SUITE in
    "unit")
      run_unit_tests || overall_exit_code=$?
      ;;
    "integration")
      run_integration_tests || overall_exit_code=$?
      ;;
    "e2e")
      run_e2e_tests || overall_exit_code=$?
      ;;
    "performance")
      run_performance_tests || overall_exit_code=$?
      ;;
    "security")
      run_security_tests || overall_exit_code=$?
      ;;
    "all")
      run_unit_tests || overall_exit_code=$?
      run_integration_tests || overall_exit_code=$?
      run_e2e_tests || overall_exit_code=$?
      run_performance_tests || overall_exit_code=$?
      run_security_tests || overall_exit_code=$?
      ;;
    *)
      log_error "Unknown test suite: $TEST_SUITE"
      usage
      exit 1
      ;;
  esac
  
  generate_report
  
  if [ $overall_exit_code -eq 0 ]; then
    log_success "All tests completed successfully!"
  else
    log_error "Some tests failed (exit code: $overall_exit_code)"
  fi
  
  exit $overall_exit_code
}

# Run main function
main "$@"