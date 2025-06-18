#!/bin/bash
# AUSTA Cockpit Smoke Tests
# Basic functionality tests to verify deployment success

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../../" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Global variables
ENVIRONMENT=""
BASE_URL=""
TIMEOUT=30
PARALLEL=false
VERBOSE=false

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Logging functions
log_info() {
    echo -e "${BLUE}[SMOKE]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_TESTS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_TESTS++))
}

log_test() {
    echo -e "${PURPLE}[TEST]${NC} $1"
    ((TOTAL_TESTS++))
}

# Help function
show_help() {
    cat << EOF
AUSTA Cockpit Smoke Tests

Usage: $0 <environment> [options]

Arguments:
    environment                     Target environment (development|staging|production)

Options:
    -u, --url <url>                 Base URL for testing (auto-detected if not provided)
    -t, --timeout <seconds>         Request timeout (default: 30)
    -p, --parallel                  Run tests in parallel
    -v, --verbose                   Enable verbose output
    -h, --help                      Show this help message

Smoke Tests:
    - Application availability
    - Authentication endpoints
    - API health checks
    - Database connectivity
    - Core functionality
    - User interface accessibility
    - AI service integration

Examples:
    $0 production
    $0 staging --url https://staging.austa-cockpit.com --parallel
    $0 development --verbose --timeout 60
EOF
}

# Parse command line arguments
parse_args() {
    if [[ $# -eq 0 ]]; then
        show_help
        exit 1
    fi
    
    ENVIRONMENT="$1"
    shift
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -u|--url)
                BASE_URL="$2"
                shift 2
                ;;
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -p|--parallel)
                PARALLEL=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Validate arguments
validate_args() {
    if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
        log_error "Invalid environment: $ENVIRONMENT"
        exit 1
    fi
    
    # Auto-detect base URL if not provided
    if [[ -z "$BASE_URL" ]]; then
        case "$ENVIRONMENT" in
            development)
                BASE_URL="http://localhost:3000"
                ;;
            staging)
                BASE_URL="https://staging.austa-cockpit.com"
                ;;
            production)
                BASE_URL="https://austa-cockpit.com"
                ;;
        esac
    fi
    
    log_info "Base URL: $BASE_URL"
}

# Make HTTP request with timeout and retries
make_request() {
    local url="$1"
    local method="${2:-GET}"
    local data="${3:-}"
    local expected_status="${4:-200}"
    local retries=3
    
    for ((i=1; i<=retries; i++)); do
        local response_code
        
        if [[ -n "$data" ]]; then
            response_code=$(curl -s -w "%{http_code}" \
                --max-time "$TIMEOUT" \
                --connect-timeout 10 \
                -X "$method" \
                -H "Content-Type: application/json" \
                -d "$data" \
                -o /dev/null \
                "$url" 2>/dev/null || echo "000")
        else
            response_code=$(curl -s -w "%{http_code}" \
                --max-time "$TIMEOUT" \
                --connect-timeout 10 \
                -X "$method" \
                -o /dev/null \
                "$url" 2>/dev/null || echo "000")
        fi
        
        if [[ "$response_code" == "$expected_status" ]]; then
            return 0
        fi
        
        if [[ "$VERBOSE" == "true" ]]; then
            log_info "Attempt $i/$retries failed: HTTP $response_code (expected $expected_status)"
        fi
        
        if [[ $i -lt $retries ]]; then
            sleep 2
        fi
    done
    
    return 1
}

# Test application availability
test_application_availability() {
    log_test "Testing application availability"
    
    if make_request "$BASE_URL" "GET" "" "200"; then
        log_success "Application is available at $BASE_URL"
        return 0
    else
        log_error "Application is not available at $BASE_URL"
        return 1
    fi
}

# Test health endpoints
test_health_endpoints() {
    log_test "Testing health endpoints"
    
    local endpoints=(
        "/health"
        "/api/health"
        "/ai/health"
    )
    
    local all_healthy=true
    
    for endpoint in "${endpoints[@]}"; do
        if make_request "${BASE_URL}${endpoint}" "GET" "" "200"; then
            log_success "Health endpoint $endpoint is responding"
        else
            log_error "Health endpoint $endpoint is not responding"
            all_healthy=false
        fi
    done
    
    if [[ "$all_healthy" == "true" ]]; then
        return 0
    else
        return 1
    fi
}

# Test API endpoints
test_api_endpoints() {
    log_test "Testing API endpoints"
    
    local endpoints=(
        "/api/v1/status"
        "/api/v1/auth/health"
        "/api/v1/cases/health"
        "/api/v1/analytics/health"
    )
    
    local all_working=true
    
    for endpoint in "${endpoints[@]}"; do
        if make_request "${BASE_URL}${endpoint}" "GET" "" "200"; then
            log_success "API endpoint $endpoint is working"
        else
            log_error "API endpoint $endpoint is not working"
            all_working=false
        fi
    done
    
    if [[ "$all_working" == "true" ]]; then
        return 0
    else
        return 1
    fi
}

# Test authentication system
test_authentication() {
    log_test "Testing authentication system"
    
    # Test registration endpoint availability
    if make_request "${BASE_URL}/api/v1/auth/register" "POST" '{"test": "data"}' "400"; then
        log_success "Registration endpoint is accessible"
    else
        log_error "Registration endpoint is not accessible"
        return 1
    fi
    
    # Test login endpoint availability
    if make_request "${BASE_URL}/api/v1/auth/login" "POST" '{"test": "data"}' "400"; then
        log_success "Login endpoint is accessible"
    else
        log_error "Login endpoint is not accessible"
        return 1
    fi
    
    return 0
}

# Test database connectivity
test_database_connectivity() {
    log_test "Testing database connectivity"
    
    # Test database health through API
    if make_request "${BASE_URL}/api/v1/health/database" "GET" "" "200"; then
        log_success "Database connectivity is working"
        return 0
    else
        log_error "Database connectivity is failing"
        return 1
    fi
}

# Test AI service integration
test_ai_service() {
    log_test "Testing AI service integration"
    
    # Test AI service health
    if make_request "${BASE_URL}/ai/health" "GET" "" "200"; then
        log_success "AI service is responding"
    else
        log_error "AI service is not responding"
        return 1
    fi
    
    # Test AI service models endpoint
    if make_request "${BASE_URL}/ai/models" "GET" "" "200"; then
        log_success "AI models endpoint is working"
    else
        log_error "AI models endpoint is not working"
        return 1
    fi
    
    return 0
}

# Test case management functionality
test_case_management() {
    log_test "Testing case management functionality"
    
    # Test cases list endpoint
    if make_request "${BASE_URL}/api/v1/cases" "GET" "" "401"; then
        log_success "Cases endpoint is protected (authentication required)"
    else
        log_error "Cases endpoint security check failed"
        return 1
    fi
    
    return 0
}

# Test analytics functionality
test_analytics() {
    log_test "Testing analytics functionality"
    
    # Test analytics dashboard endpoint
    if make_request "${BASE_URL}/api/v1/analytics/dashboard" "GET" "" "401"; then
        log_success "Analytics endpoint is protected (authentication required)"
    else
        log_error "Analytics endpoint security check failed"
        return 1
    fi
    
    return 0
}

# Test static assets
test_static_assets() {
    log_test "Testing static assets"
    
    local assets=(
        "/favicon.ico"
        "/static/css/main.css"
        "/static/js/main.js"
    )
    
    local assets_loaded=0
    local total_assets=${#assets[@]}
    
    for asset in "${assets[@]}"; do
        if make_request "${BASE_URL}${asset}" "GET" "" "200"; then
            ((assets_loaded++))
            if [[ "$VERBOSE" == "true" ]]; then
                log_success "Asset loaded: $asset"
            fi
        else
            if [[ "$VERBOSE" == "true" ]]; then
                log_error "Asset failed to load: $asset"
            fi
        fi
    done
    
    local success_rate=$(( (assets_loaded * 100) / total_assets ))
    
    if [[ $success_rate -ge 80 ]]; then
        log_success "Static assets loaded successfully ($assets_loaded/$total_assets)"
        return 0
    else
        log_error "Static assets loading failed ($assets_loaded/$total_assets)"
        return 1
    fi
}

# Test SSL configuration
test_ssl_configuration() {
    log_test "Testing SSL configuration"
    
    if [[ "$BASE_URL" == http://* ]]; then
        log_info "Skipping SSL test for HTTP URL"
        return 0
    fi
    
    local domain
    domain=$(echo "$BASE_URL" | sed 's|https://||' | sed 's|/.*||')
    
    # Check SSL certificate
    if echo | openssl s_client -servername "$domain" -connect "${domain}:443" 2>/dev/null | \
       openssl x509 -noout -dates &>/dev/null; then
        log_success "SSL certificate is valid"
        return 0
    else
        log_error "SSL certificate validation failed"
        return 1
    fi
}

# Test load balancer health
test_load_balancer() {
    log_test "Testing load balancer health"
    
    # Test load balancer health endpoint
    if make_request "${BASE_URL}/lb-health" "GET" "" "200"; then
        log_success "Load balancer is healthy"
    else
        # Load balancer health endpoint might not exist, check main app instead
        if make_request "$BASE_URL" "GET" "" "200"; then
            log_success "Load balancer is routing traffic correctly"
        else
            log_error "Load balancer is not routing traffic"
            return 1
        fi
    fi
    
    return 0
}

# Test monitoring endpoints
test_monitoring() {
    log_test "Testing monitoring endpoints"
    
    # Test metrics endpoint
    if make_request "${BASE_URL}/metrics" "GET" "" "200"; then
        log_success "Metrics endpoint is accessible"
    else
        log_info "Metrics endpoint is not publicly accessible (expected for security)"
    fi
    
    return 0
}

# Run a single test with error handling
run_test() {
    local test_function="$1"
    local test_name="$2"
    
    if [[ "$VERBOSE" == "true" ]]; then
        log_info "Running test: $test_name"
    fi
    
    if "$test_function"; then
        if [[ "$VERBOSE" == "true" ]]; then
            log_success "Test completed: $test_name"
        fi
        return 0
    else
        if [[ "$VERBOSE" == "true" ]]; then
            log_error "Test failed: $test_name"
        fi
        return 1
    fi
}

# Run all tests
run_all_tests() {
    local tests=(
        "test_application_availability:Application Availability"
        "test_health_endpoints:Health Endpoints"
        "test_api_endpoints:API Endpoints"
        "test_authentication:Authentication System"
        "test_database_connectivity:Database Connectivity"
        "test_ai_service:AI Service Integration"
        "test_case_management:Case Management"
        "test_analytics:Analytics"
        "test_static_assets:Static Assets"
        "test_ssl_configuration:SSL Configuration"
        "test_load_balancer:Load Balancer"
        "test_monitoring:Monitoring"
    )
    
    if [[ "$PARALLEL" == "true" ]]; then
        log_info "Running tests in parallel..."
        
        local pids=()
        for test in "${tests[@]}"; do
            local test_function test_name
            test_function="${test%:*}"
            test_name="${test#*:}"
            
            run_test "$test_function" "$test_name" &
            pids+=($!)
        done
        
        # Wait for all tests to complete
        for pid in "${pids[@]}"; do
            wait "$pid"
        done
    else
        log_info "Running tests sequentially..."
        
        for test in "${tests[@]}"; do
            local test_function test_name
            test_function="${test%:*}"
            test_name="${test#*:}"
            
            run_test "$test_function" "$test_name"
        done
    fi
}

# Generate test report
generate_report() {
    echo
    echo "Smoke Test Summary:"
    echo "=================="
    echo "Environment:      $ENVIRONMENT"
    echo "Base URL:         $BASE_URL"
    echo "Total Tests:      $TOTAL_TESTS"
    echo "Passed:           $PASSED_TESTS"
    echo "Failed:           $FAILED_TESTS"
    echo "Success Rate:     $(( (PASSED_TESTS * 100) / TOTAL_TESTS ))%"
    echo
    
    if [[ $FAILED_TESTS -eq 0 ]]; then
        log_success "All smoke tests passed!"
        return 0
    else
        log_error "$FAILED_TESTS smoke tests failed!"
        return 1
    fi
}

# Main function
main() {
    log_info "Starting smoke tests for environment: $ENVIRONMENT"
    
    if [[ "$VERBOSE" == "true" ]]; then
        log_info "Timeout: ${TIMEOUT}s | Parallel: $PARALLEL"
    fi
    
    echo
    
    # Run all smoke tests
    run_all_tests
    
    # Generate final report
    generate_report
}

# Parse arguments and run
parse_args "$@"
validate_args
main