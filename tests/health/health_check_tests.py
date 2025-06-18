"""
Comprehensive health check testing framework for AUSTA Cockpit
"""
import pytest
import asyncio
import aiohttp
import time
import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class HealthStatus(Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"

@dataclass
class HealthCheckResult:
    service: str
    endpoint: str
    status: HealthStatus
    response_time_ms: float
    status_code: int
    response_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

@dataclass
class ServiceConfig:
    name: str
    base_url: str
    health_endpoints: List[str]
    timeout: int = 30
    expected_status_codes: List[int] = None
    
    def __post_init__(self):
        if self.expected_status_codes is None:
            self.expected_status_codes = [200]

class HealthCheckTester:
    """Comprehensive health check testing framework"""
    
    def __init__(self):
        self.services = [
            ServiceConfig(
                name="ai-service",
                base_url="http://ai-service:8000",
                health_endpoints=["/health/", "/health/liveness", "/health/readiness", "/health/detailed", "/health/system"]
            ),
            ServiceConfig(
                name="backend-service", 
                base_url="http://backend-service:3000",
                health_endpoints=["/health", "/health/live", "/health/ready", "/health/detailed", "/health/metrics"]
            ),
            ServiceConfig(
                name="frontend-service",
                base_url="http://frontend-service:80",
                health_endpoints=["/health"],
                expected_status_codes=[200, 404]  # Frontend might not have health endpoint
            )
        ]
        
    async def check_service_health(self, service: ServiceConfig) -> List[HealthCheckResult]:
        """Check health for a single service across all endpoints"""
        results = []
        
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=service.timeout)) as session:
            for endpoint in service.health_endpoints:
                result = await self._check_endpoint(session, service, endpoint)
                results.append(result)
                
        return results
    
    async def _check_endpoint(self, session: aiohttp.ClientSession, service: ServiceConfig, endpoint: str) -> HealthCheckResult:
        """Check a single health endpoint"""
        url = f"{service.base_url}{endpoint}"
        start_time = time.time()
        
        try:
            async with session.get(url) as response:
                response_time_ms = (time.time() - start_time) * 1000
                
                try:
                    response_data = await response.json()
                except:
                    response_data = {"text": await response.text()}
                
                # Determine health status
                if response.status in service.expected_status_codes:
                    if response_time_ms > 5000:  # 5 seconds
                        status = HealthStatus.UNHEALTHY
                    elif response_time_ms > 2000:  # 2 seconds
                        status = HealthStatus.DEGRADED
                    else:
                        status = HealthStatus.HEALTHY
                else:
                    status = HealthStatus.UNHEALTHY
                
                return HealthCheckResult(
                    service=service.name,
                    endpoint=endpoint,
                    status=status,
                    response_time_ms=response_time_ms,
                    status_code=response.status,
                    response_data=response_data
                )
                
        except Exception as e:
            response_time_ms = (time.time() - start_time) * 1000
            return HealthCheckResult(
                service=service.name,
                endpoint=endpoint,
                status=HealthStatus.UNHEALTHY,
                response_time_ms=response_time_ms,
                status_code=0,
                error=str(e)
            )
    
    async def run_comprehensive_health_check(self) -> Dict[str, List[HealthCheckResult]]:
        """Run health checks for all services"""
        results = {}
        
        for service in self.services:
            logger.info(f"Checking health for {service.name}")
            service_results = await self.check_service_health(service)
            results[service.name] = service_results
            
        return results
    
    def analyze_results(self, results: Dict[str, List[HealthCheckResult]]) -> Dict[str, Any]:
        """Analyze health check results and provide summary"""
        analysis = {
            "overall_status": HealthStatus.HEALTHY,
            "service_summary": {},
            "critical_issues": [],
            "warnings": [],
            "performance_issues": []
        }
        
        for service_name, service_results in results.items():
            healthy_count = sum(1 for r in service_results if r.status == HealthStatus.HEALTHY)
            degraded_count = sum(1 for r in service_results if r.status == HealthStatus.DEGRADED)
            unhealthy_count = sum(1 for r in service_results if r.status == HealthStatus.UNHEALTHY)
            
            avg_response_time = sum(r.response_time_ms for r in service_results) / len(service_results)
            
            service_status = HealthStatus.HEALTHY
            if unhealthy_count > 0:
                service_status = HealthStatus.UNHEALTHY
            elif degraded_count > 0:
                service_status = HealthStatus.DEGRADED
            
            analysis["service_summary"][service_name] = {
                "status": service_status,
                "healthy_endpoints": healthy_count,
                "degraded_endpoints": degraded_count,
                "unhealthy_endpoints": unhealthy_count,
                "avg_response_time_ms": avg_response_time
            }
            
            # Update overall status
            if service_status == HealthStatus.UNHEALTHY:
                analysis["overall_status"] = HealthStatus.UNHEALTHY
            elif service_status == HealthStatus.DEGRADED and analysis["overall_status"] != HealthStatus.UNHEALTHY:
                analysis["overall_status"] = HealthStatus.DEGRADED
            
            # Collect issues
            for result in service_results:
                if result.status == HealthStatus.UNHEALTHY:
                    analysis["critical_issues"].append({
                        "service": service_name,
                        "endpoint": result.endpoint,
                        "error": result.error or f"HTTP {result.status_code}",
                        "response_time_ms": result.response_time_ms
                    })
                elif result.status == HealthStatus.DEGRADED:
                    analysis["warnings"].append({
                        "service": service_name,
                        "endpoint": result.endpoint,
                        "issue": "Slow response time",
                        "response_time_ms": result.response_time_ms
                    })
                
                if result.response_time_ms > 1000:  # 1 second
                    analysis["performance_issues"].append({
                        "service": service_name,
                        "endpoint": result.endpoint,
                        "response_time_ms": result.response_time_ms,
                        "threshold_exceeded": "1000ms"
                    })
        
        return analysis


# Test cases
class TestHealthChecks:
    """Test cases for health check functionality"""
    
    @pytest.fixture
    def health_tester(self):
        return HealthCheckTester()
    
    @pytest.mark.asyncio
    async def test_all_services_health(self, health_tester):
        """Test that all services respond to health checks"""
        results = await health_tester.run_comprehensive_health_check()
        
        # Ensure all services are checked
        expected_services = ["ai-service", "backend-service", "frontend-service"]
        assert set(results.keys()) == set(expected_services)
        
        # Ensure each service has results
        for service_name in expected_services:
            assert len(results[service_name]) > 0
    
    @pytest.mark.asyncio
    async def test_health_endpoints_respond_quickly(self, health_tester):
        """Test that health endpoints respond within acceptable time"""
        results = await health_tester.run_comprehensive_health_check()
        
        slow_endpoints = []
        for service_name, service_results in results.items():
            for result in service_results:
                if result.response_time_ms > 5000:  # 5 seconds
                    slow_endpoints.append(f"{service_name}{result.endpoint}")
        
        assert len(slow_endpoints) == 0, f"Slow health endpoints: {slow_endpoints}"
    
    @pytest.mark.asyncio
    async def test_critical_services_healthy(self, health_tester):
        """Test that critical services are healthy"""
        results = await health_tester.run_comprehensive_health_check()
        analysis = health_tester.analyze_results(results)
        
        critical_services = ["ai-service", "backend-service"]
        for service in critical_services:
            service_summary = analysis["service_summary"].get(service)
            assert service_summary is not None
            assert service_summary["status"] in [HealthStatus.HEALTHY, HealthStatus.DEGRADED]
    
    @pytest.mark.asyncio
    async def test_detailed_health_checks_comprehensive(self, health_tester):
        """Test that detailed health checks provide comprehensive information"""
        results = await health_tester.run_comprehensive_health_check()
        
        # Check AI service detailed health
        ai_results = results.get("ai-service", [])
        detailed_result = next((r for r in ai_results if r.endpoint == "/health/detailed"), None)
        
        if detailed_result and detailed_result.response_data:
            required_fields = ["status", "checks", "timestamp"]
            for field in required_fields:
                assert field in detailed_result.response_data
        
        # Check backend service detailed health
        backend_results = results.get("backend-service", [])
        detailed_result = next((r for r in backend_results if r.endpoint == "/health/detailed"), None)
        
        if detailed_result and detailed_result.response_data:
            required_fields = ["status", "services", "timestamp"]
            for field in required_fields:
                assert field in detailed_result.response_data
    
    @pytest.mark.asyncio
    async def test_readiness_and_liveness_separation(self, health_tester):
        """Test that readiness and liveness probes work independently"""
        results = await health_tester.run_comprehensive_health_check()
        
        for service_name, service_results in results.items():
            liveness_result = next((r for r in service_results if "liveness" in r.endpoint or "live" in r.endpoint), None)
            readiness_result = next((r for r in service_results if "readiness" in r.endpoint or "ready" in r.endpoint), None)
            
            if liveness_result and readiness_result:
                # Liveness should be simpler and faster than readiness
                assert liveness_result.response_time_ms <= readiness_result.response_time_ms * 2
    
    @pytest.mark.asyncio
    async def test_health_check_data_structure(self, health_tester):
        """Test that health check responses have expected data structure"""
        results = await health_tester.run_comprehensive_health_check()
        
        for service_name, service_results in results.items():
            for result in service_results:
                # Basic structure validation
                assert hasattr(result, 'service')
                assert hasattr(result, 'endpoint')
                assert hasattr(result, 'status')
                assert hasattr(result, 'response_time_ms')
                assert hasattr(result, 'status_code')
                
                # Response time should be reasonable
                assert result.response_time_ms >= 0
                assert result.response_time_ms < 30000  # 30 seconds max
    
    @pytest.mark.asyncio
    async def test_circuit_breaker_integration(self, health_tester):
        """Test circuit breaker integration in health checks"""
        results = await health_tester.run_comprehensive_health_check()
        
        # Check if backend service reports circuit breaker status
        backend_results = results.get("backend-service", [])
        detailed_result = next((r for r in backend_results if r.endpoint == "/health/detailed"), None)
        
        if detailed_result and detailed_result.response_data:
            # Should have circuit breaker information
            if "circuit_breakers" in detailed_result.response_data:
                cb_data = detailed_result.response_data["circuit_breakers"]
                assert isinstance(cb_data, dict)
                # Should have common circuit breakers
                expected_cbs = ["database", "redis", "ai_service"]
                for cb_name in expected_cbs:
                    if cb_name in cb_data:
                        assert "state" in cb_data[cb_name]
                        assert cb_data[cb_name]["state"] in ["CLOSED", "OPEN", "HALF_OPEN"]


# Utility functions for manual testing
async def run_health_check_report():
    """Generate a comprehensive health check report"""
    tester = HealthCheckTester()
    results = await tester.run_comprehensive_health_check()
    analysis = tester.analyze_results(results)
    
    print("=== AUSTA Cockpit Health Check Report ===")
    print(f"Overall Status: {analysis['overall_status'].value.upper()}")
    print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    print("Service Summary:")
    for service_name, summary in analysis["service_summary"].items():
        print(f"  {service_name}: {summary['status'].value.upper()}")
        print(f"    Avg Response Time: {summary['avg_response_time_ms']:.2f}ms")
        print(f"    Healthy: {summary['healthy_endpoints']}, Degraded: {summary['degraded_endpoints']}, Unhealthy: {summary['unhealthy_endpoints']}")
    
    if analysis["critical_issues"]:
        print("\nCritical Issues:")
        for issue in analysis["critical_issues"]:
            print(f"  - {issue['service']}{issue['endpoint']}: {issue['error']}")
    
    if analysis["warnings"]:
        print("\nWarnings:")
        for warning in analysis["warnings"]:
            print(f"  - {warning['service']}{warning['endpoint']}: {warning['issue']} ({warning['response_time_ms']:.2f}ms)")
    
    if analysis["performance_issues"]:
        print("\nPerformance Issues:")
        for perf in analysis["performance_issues"]:
            print(f"  - {perf['service']}{perf['endpoint']}: {perf['response_time_ms']:.2f}ms (threshold: {perf['threshold_exceeded']})")
    
    print("\nDetailed Results:")
    for service_name, service_results in results.items():
        print(f"\n{service_name}:")
        for result in service_results:
            status_indicator = "✓" if result.status == HealthStatus.HEALTHY else "⚠" if result.status == HealthStatus.DEGRADED else "✗"
            print(f"  {status_indicator} {result.endpoint}: {result.status.value} ({result.response_time_ms:.2f}ms)")
            if result.error:
                print(f"    Error: {result.error}")

if __name__ == "__main__":
    asyncio.run(run_health_check_report())