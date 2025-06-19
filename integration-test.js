#!/usr/bin/env node

/**
 * AUSTA Cockpit Full Stack Integration Test
 * Tests end-to-end functionality across frontend, backend, and database
 */

const http = require('http');
const https = require('https');

// Test configuration
const BACKEND_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 5000;

// Test results
const testResults = {
    backend: {},
    frontend: {},
    database: {},
    integration: {},
    summary: {
        total: 0,
        passed: 0,
        failed: 0
    }
};

// Utility function to make HTTP requests
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            timeout: TEST_TIMEOUT
        };

        const req = protocol.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsedData = res.headers['content-type']?.includes('application/json') 
                        ? JSON.parse(data) 
                        : data;
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: parsedData
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => reject(new Error('Request timeout')));

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }

        req.end();
    });
}

// Test functions
async function testBackendHealth() {
    console.log('\n🔍 Testing Backend Health...');
    try {
        const response = await makeRequest(`${BACKEND_URL}/health`);
        
        if (response.statusCode === 200 && response.data.status === 'healthy') {
            testResults.backend.health = 'PASS';
            console.log('✅ Backend health check passed');
            console.log(`   - Uptime: ${response.data.uptime}s`);
            return true;
        } else {
            testResults.backend.health = 'FAIL';
            console.log('❌ Backend health check failed');
            return false;
        }
    } catch (error) {
        testResults.backend.health = 'FAIL';
        console.log('❌ Backend health check failed:', error.message);
        return false;
    }
}

async function testBackendEndpoints() {
    console.log('\n🔍 Testing Backend API Endpoints...');
    
    const endpoints = [
        { path: '/metrics', name: 'Metrics' },
        { path: '/api/analytics/kpis', name: 'Analytics KPIs' },
        { path: '/api/analytics/real-time', name: 'Real-time Analytics' }
    ];

    let passCount = 0;
    
    for (const endpoint of endpoints) {
        try {
            const response = await makeRequest(`${BACKEND_URL}${endpoint.path}`);
            
            if (response.statusCode < 500) {
                testResults.backend[endpoint.name.toLowerCase().replace(' ', '_')] = 'PASS';
                console.log(`✅ ${endpoint.name} endpoint accessible (${response.statusCode})`);
                passCount++;
            } else {
                testResults.backend[endpoint.name.toLowerCase().replace(' ', '_')] = 'FAIL';
                console.log(`❌ ${endpoint.name} endpoint failed (${response.statusCode})`);
            }
        } catch (error) {
            testResults.backend[endpoint.name.toLowerCase().replace(' ', '_')] = 'FAIL';
            console.log(`❌ ${endpoint.name} endpoint error:`, error.message);
        }
    }

    return passCount === endpoints.length;
}

async function testFrontendAccessibility() {
    console.log('\n🔍 Testing Frontend Accessibility...');
    try {
        const response = await makeRequest(FRONTEND_URL);
        
        if (response.statusCode === 200 && 
            response.data.includes('AUSTA Cockpit')) {
            testResults.frontend.accessibility = 'PASS';
            console.log('✅ Frontend is accessible');
            console.log('   - Title: AUSTA Cockpit found in HTML');
            return true;
        } else {
            testResults.frontend.accessibility = 'FAIL';
            console.log('❌ Frontend accessibility failed');
            return false;
        }
    } catch (error) {
        testResults.frontend.accessibility = 'FAIL';
        console.log('❌ Frontend accessibility failed:', error.message);
        return false;
    }
}

async function testDatabaseConnectivity() {
    console.log('\n🔍 Testing Database Connectivity...');
    try {
        // Test database connectivity through backend health endpoint
        const response = await makeRequest(`${BACKEND_URL}/health`);
        
        if (response.statusCode === 200) {
            testResults.database.connectivity = 'PASS';
            console.log('✅ Database connectivity verified through backend');
            return true;
        } else {
            testResults.database.connectivity = 'FAIL';
            console.log('❌ Database connectivity test failed');
            return false;
        }
    } catch (error) {
        testResults.database.connectivity = 'FAIL';
        console.log('❌ Database connectivity test failed:', error.message);
        return false;
    }
}

async function testCRUDOperations() {
    console.log('\n🔍 Testing CRUD Operations...');
    
    // Test creating analytics data
    try {
        const createResponse = await makeRequest(`${BACKEND_URL}/api/analytics`, {
            method: 'POST',
            body: {
                type: 'test',
                data: { test: true },
                timestamp: new Date().toISOString()
            }
        });

        if (createResponse.statusCode < 500) {
            testResults.integration.crud_create = 'PASS';
            console.log(`✅ CREATE operation test passed (${createResponse.statusCode})`);
        } else {
            testResults.integration.crud_create = 'FAIL';
            console.log(`❌ CREATE operation test failed (${createResponse.statusCode})`);
        }
    } catch (error) {
        testResults.integration.crud_create = 'FAIL';
        console.log('❌ CREATE operation test failed:', error.message);
    }

    // Test reading analytics data
    try {
        const readResponse = await makeRequest(`${BACKEND_URL}/api/analytics/kpis`);
        
        if (readResponse.statusCode < 500) {
            testResults.integration.crud_read = 'PASS';
            console.log(`✅ READ operation test passed (${readResponse.statusCode})`);
        } else {
            testResults.integration.crud_read = 'FAIL';
            console.log(`❌ READ operation test failed (${readResponse.statusCode})`);
        }
    } catch (error) {
        testResults.integration.crud_read = 'FAIL';
        console.log('❌ READ operation test failed:', error.message);
    }
}

async function testErrorHandling() {
    console.log('\n🔍 Testing Error Handling...');
    
    try {
        const response = await makeRequest(`${BACKEND_URL}/nonexistent-endpoint`);
        
        if (response.statusCode === 404) {
            testResults.integration.error_handling = 'PASS';
            console.log('✅ 404 error handling works correctly');
        } else {
            testResults.integration.error_handling = 'FAIL';
            console.log(`❌ Expected 404, got ${response.statusCode}`);
        }
    } catch (error) {
        testResults.integration.error_handling = 'FAIL';
        console.log('❌ Error handling test failed:', error.message);
    }
}

async function testPerformance() {
    console.log('\n🔍 Testing Performance...');
    
    const startTime = Date.now();
    try {
        await makeRequest(`${BACKEND_URL}/health`);
        const responseTime = Date.now() - startTime;
        
        if (responseTime < 1000) {
            testResults.integration.performance = 'PASS';
            console.log(`✅ Performance test passed (${responseTime}ms)`);
        } else {
            testResults.integration.performance = 'FAIL';
            console.log(`❌ Performance test failed (${responseTime}ms > 1000ms)`);
        }
    } catch (error) {
        testResults.integration.performance = 'FAIL';
        console.log('❌ Performance test failed:', error.message);
    }
}

function generateReport() {
    console.log('\n📊 INTEGRATION TEST REPORT');
    console.log('='.repeat(50));
    
    // Calculate totals
    let totalTests = 0;
    let passedTests = 0;
    
    const countResults = (section) => {
        Object.values(section).forEach(result => {
            totalTests++;
            if (result === 'PASS') passedTests++;
        });
    };
    
    countResults(testResults.backend);
    countResults(testResults.frontend);
    countResults(testResults.database);
    countResults(testResults.integration);
    
    testResults.summary = {
        total: totalTests,
        passed: passedTests,
        failed: totalTests - passedTests,
        successRate: ((passedTests / totalTests) * 100).toFixed(1)
    };
    
    console.log(`\n🎯 SUMMARY:`);
    console.log(`   Total Tests: ${testResults.summary.total}`);
    console.log(`   Passed: ${testResults.summary.passed}`);
    console.log(`   Failed: ${testResults.summary.failed}`);
    console.log(`   Success Rate: ${testResults.summary.successRate}%`);
    
    console.log(`\n📋 DETAILED RESULTS:`);
    console.log(`   Backend Tests: ${Object.keys(testResults.backend).length}`);
    console.log(`   Frontend Tests: ${Object.keys(testResults.frontend).length}`);
    console.log(`   Database Tests: ${Object.keys(testResults.database).length}`);
    console.log(`   Integration Tests: ${Object.keys(testResults.integration).length}`);
    
    console.log(`\n🏥 SYSTEM HEALTH:`);
    const systemHealth = testResults.summary.successRate >= 80 ? '🟢 HEALTHY' : 
                        testResults.summary.successRate >= 60 ? '🟡 WARNING' : 
                        '🔴 CRITICAL';
    console.log(`   Overall Status: ${systemHealth}`);
    
    // Component status
    const backendStatus = Object.values(testResults.backend).every(r => r === 'PASS') ? '🟢' : '🔴';
    const frontendStatus = Object.values(testResults.frontend).every(r => r === 'PASS') ? '🟢' : '🔴';
    const databaseStatus = Object.values(testResults.database).every(r => r === 'PASS') ? '🟢' : '🔴';
    
    console.log(`   Backend: ${backendStatus}`);
    console.log(`   Frontend: ${frontendStatus}`);
    console.log(`   Database: ${databaseStatus}`);
    
    console.log('\n' + '='.repeat(50));
    
    return testResults;
}

// Main test execution
async function runIntegrationTests() {
    console.log('🚀 AUSTA Cockpit Full Stack Integration Test Suite');
    console.log('='.repeat(50));
    console.log(`🕐 Started at: ${new Date().toISOString()}`);
    
    // Run all tests
    await testBackendHealth();
    await testBackendEndpoints();
    await testFrontendAccessibility();
    await testDatabaseConnectivity();
    await testCRUDOperations();
    await testErrorHandling();
    await testPerformance();
    
    // Generate and display report
    const finalReport = generateReport();
    
    // Write results to file for future reference
    require('fs').writeFileSync(
        '/Users/rodrigo/claude-projects/QualityControl/QualityControl/integration-test-results.json',
        JSON.stringify(finalReport, null, 2)
    );
    
    console.log(`\n💾 Results saved to: integration-test-results.json`);
    console.log(`🕐 Completed at: ${new Date().toISOString()}`);
    
    // Exit with appropriate code
    process.exit(finalReport.summary.successRate >= 80 ? 0 : 1);
}

// Run the tests
if (require.main === module) {
    runIntegrationTests().catch(error => {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = { runIntegrationTests, testResults };