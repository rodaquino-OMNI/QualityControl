#!/bin/bash

# JMeter Test Runner Script for AUSTA Cockpit
# Executes JMeter performance tests with configurable parameters

set -e

# Default configuration
DEFAULT_TEST_PLAN="workflow-test.jmx"
DEFAULT_THREADS=50
DEFAULT_DURATION=600
DEFAULT_RAMP_UP=120
DEFAULT_BASE_URL="http://localhost:8000"
DEFAULT_FRONTEND_URL="http://localhost:3000"
DEFAULT_AI_SERVICE_URL="http://localhost:8001"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -t|--test-plan)
      TEST_PLAN="$2"
      shift 2
      ;;
    -n|--threads)
      THREADS="$2"
      shift 2
      ;;
    -d|--duration)
      DURATION="$2"
      shift 2
      ;;
    -r|--ramp-up)
      RAMP_UP="$2"
      shift 2
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --frontend-url)
      FRONTEND_URL="$2"
      shift 2
      ;;
    --ai-service-url)
      AI_SERVICE_URL="$2"
      shift 2
      ;;
    --results-dir)
      RESULTS_DIR="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  -t, --test-plan <file>        JMeter test plan file (default: $DEFAULT_TEST_PLAN)"
      echo "  -n, --threads <number>        Number of concurrent threads (default: $DEFAULT_THREADS)"
      echo "  -d, --duration <seconds>      Test duration in seconds (default: $DEFAULT_DURATION)"
      echo "  -r, --ramp-up <seconds>       Ramp-up period in seconds (default: $DEFAULT_RAMP_UP)"
      echo "  --base-url <url>              Backend API base URL (default: $DEFAULT_BASE_URL)"
      echo "  --frontend-url <url>          Frontend base URL (default: $DEFAULT_FRONTEND_URL)"
      echo "  --ai-service-url <url>        AI service base URL (default: $DEFAULT_AI_SERVICE_URL)"
      echo "  --results-dir <directory>     Results output directory"
      echo "  -h, --help                    Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                                    # Run with default settings"
      echo "  $0 -n 100 -d 900 -r 180             # 100 threads, 15 min test, 3 min ramp-up"
      echo "  $0 --base-url https://api.prod.com   # Test against production API"
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

# Set defaults if not provided
TEST_PLAN=${TEST_PLAN:-$DEFAULT_TEST_PLAN}
THREADS=${THREADS:-$DEFAULT_THREADS}
DURATION=${DURATION:-$DEFAULT_DURATION}
RAMP_UP=${RAMP_UP:-$DEFAULT_RAMP_UP}
BASE_URL=${BASE_URL:-$DEFAULT_BASE_URL}
FRONTEND_URL=${FRONTEND_URL:-$DEFAULT_FRONTEND_URL}
AI_SERVICE_URL=${AI_SERVICE_URL:-$DEFAULT_AI_SERVICE_URL}

# Set up directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESULTS_DIR=${RESULTS_DIR:-"$PROJECT_ROOT/results/jmeter"}

# Create results directory
mkdir -p "$RESULTS_DIR"

# Generate timestamp for this test run
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEST_RUN_ID="jmeter_test_${TIMESTAMP}"

# Set up result files
RESULTS_FILE="$RESULTS_DIR/${TEST_RUN_ID}_results.jtl"
LOG_FILE="$RESULTS_DIR/${TEST_RUN_ID}_jmeter.log"
HTML_REPORT_DIR="$RESULTS_DIR/${TEST_RUN_ID}_html_report"

echo "======================================"
echo "AUSTA Cockpit JMeter Performance Test"
echo "======================================"
echo "Test Plan: $TEST_PLAN"
echo "Threads: $THREADS"
echo "Duration: ${DURATION}s ($(($DURATION / 60)) minutes)"
echo "Ramp-up: ${RAMP_UP}s"
echo "Base URL: $BASE_URL"
echo "Frontend URL: $FRONTEND_URL"
echo "AI Service URL: $AI_SERVICE_URL"
echo "Results Directory: $RESULTS_DIR"
echo "Test Run ID: $TEST_RUN_ID"
echo "======================================"

# Check if JMeter is installed
if ! command -v jmeter &> /dev/null; then
    echo "Error: JMeter is not installed or not in PATH"
    echo "Please install JMeter and ensure it's in your PATH"
    echo "Download from: https://jmeter.apache.org/download_jmeter.cgi"
    exit 1
fi

# Check if test plan exists
if [[ ! -f "$SCRIPT_DIR/$TEST_PLAN" ]]; then
    echo "Error: Test plan file not found: $SCRIPT_DIR/$TEST_PLAN"
    exit 1
fi

# Check if target services are reachable
echo "Checking service connectivity..."

check_service() {
    local url=$1
    local name=$2
    if curl -f -s --max-time 10 "$url/health" > /dev/null 2>&1 || curl -f -s --max-time 10 "$url" > /dev/null 2>&1; then
        echo "✓ $name is reachable at $url"
        return 0
    else
        echo "⚠ Warning: $name may not be reachable at $url"
        return 1
    fi
}

check_service "$BASE_URL" "Backend API"
check_service "$FRONTEND_URL" "Frontend"
check_service "$AI_SERVICE_URL" "AI Service"

echo ""
read -p "Continue with the test? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Test cancelled."
    exit 0
fi

# Run JMeter test
echo "Starting JMeter test..."
echo "Log file: $LOG_FILE"
echo "Results file: $RESULTS_FILE"
echo ""

# JMeter command with all parameters
jmeter \
    -n \
    -t "$SCRIPT_DIR/$TEST_PLAN" \
    -l "$RESULTS_FILE" \
    -j "$LOG_FILE" \
    -Jbase_url="$BASE_URL" \
    -Jfrontend_url="$FRONTEND_URL" \
    -Jai_service_url="$AI_SERVICE_URL" \
    -Jconcurrent_users="$THREADS" \
    -Jtest_duration="$DURATION" \
    -Jramp_up_period="$RAMP_UP" \
    -Jtest_run_id="$TEST_RUN_ID"

# Check if test completed successfully
if [[ $? -eq 0 ]]; then
    echo ""
    echo "✓ JMeter test completed successfully!"
    
    # Generate HTML report if results file exists and has data
    if [[ -f "$RESULTS_FILE" ]] && [[ -s "$RESULTS_FILE" ]]; then
        echo "Generating HTML report..."
        
        # Create HTML report
        jmeter \
            -g "$RESULTS_FILE" \
            -o "$HTML_REPORT_DIR" \
            > /dev/null 2>&1
        
        if [[ $? -eq 0 ]]; then
            echo "✓ HTML report generated: $HTML_REPORT_DIR/index.html"
        else
            echo "⚠ Warning: Could not generate HTML report"
        fi
        
        # Basic statistics
        echo ""
        echo "======================================"
        echo "Test Summary"
        echo "======================================"
        
        # Count total requests
        total_requests=$(tail -n +2 "$RESULTS_FILE" | wc -l)
        echo "Total Requests: $total_requests"
        
        # Count failed requests
        failed_requests=$(tail -n +2 "$RESULTS_FILE" | awk -F',' '$8 == "false"' | wc -l)
        echo "Failed Requests: $failed_requests"
        
        # Calculate success rate
        if [[ $total_requests -gt 0 ]]; then
            success_rate=$(awk "BEGIN {printf \"%.2f\", (($total_requests - $failed_requests) / $total_requests) * 100}")
            echo "Success Rate: ${success_rate}%"
        fi
        
        # Average response time
        if [[ $total_requests -gt 0 ]]; then
            avg_response_time=$(tail -n +2 "$RESULTS_FILE" | awk -F',' '{sum+=$2; count++} END {if(count>0) printf "%.0f", sum/count}')
            echo "Average Response Time: ${avg_response_time}ms"
        fi
        
        echo "======================================"
        
        # Check for performance thresholds
        if [[ $failed_requests -gt 0 ]]; then
            failure_rate=$(awk "BEGIN {printf \"%.4f\", ($failed_requests / $total_requests)}")
            if (( $(awk "BEGIN {print ($failure_rate > 0.01)}") )); then
                echo "⚠ Warning: Failure rate (${failure_rate}) exceeds 1% threshold"
            fi
        fi
        
        if [[ -n $avg_response_time ]] && [[ $avg_response_time -gt 5000 ]]; then
            echo "⚠ Warning: Average response time (${avg_response_time}ms) exceeds 5s threshold"
        fi
        
    else
        echo "⚠ Warning: No results generated or results file is empty"
    fi
    
else
    echo ""
    echo "✗ JMeter test failed!"
    echo "Check the log file for details: $LOG_FILE"
    exit 1
fi

echo ""
echo "Test results saved to: $RESULTS_DIR"
echo "View HTML report: open $HTML_REPORT_DIR/index.html"