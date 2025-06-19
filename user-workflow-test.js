#!/usr/bin/env node

/**
 * AUSTA Cockpit User Workflow Integration Test
 * Simulates complete user workflows from frontend through backend to database
 */

const http = require('http');
const { execSync } = require('child_process');

// Test configuration
const BACKEND_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:3000';

// Test results storage
const workflowResults = {
    userRegistration: {},
    dataAnalysis: {},
    systemPerformance: {},
    realTimeMetrics: {},
    dataExport: {},
    errorScenarios: {}
};

// Utility function for HTTP requests
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            timeout: 10000
        };

        const req = http.request(reqOptions, (res) => {
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

// Database query function
function queryDatabase(query) {
    try {
        const result = execSync(
            `docker exec austa-postgres-debug psql -U austa -d austa_db -t -c "${query}"`,
            { encoding: 'utf8' }
        );
        return result.trim();
    } catch (error) {
        console.error('Database query failed:', error.message);
        return null;
    }
}

// Workflow Tests

async function testUserRegistrationWorkflow() {
    console.log('\n👤 Testing User Registration Workflow...');
    
    try {
        // Step 1: Check if user exists
        const existingUser = queryDatabase(
            "SELECT email FROM auth.users WHERE email = 'test@integration.com';"
        );
        
        if (existingUser && existingUser.includes('test@integration.com')) {
            console.log('✅ Test user already exists in database');
            workflowResults.userRegistration.userExists = true;
        } else {
            console.log('ℹ️  Test user does not exist (expected for fresh system)');
            workflowResults.userRegistration.userExists = false;
        }
        
        // Step 2: Test user lookup
        const userCount = queryDatabase("SELECT COUNT(*) FROM auth.users;");
        console.log(`✅ Total users in system: ${userCount}`);
        workflowResults.userRegistration.totalUsers = parseInt(userCount) || 0;
        
        // Step 3: Verify admin user exists
        const adminUser = queryDatabase(
            "SELECT email, role FROM auth.users WHERE role = 'admin' LIMIT 1;"
        );
        
        if (adminUser && adminUser.includes('admin')) {
            console.log('✅ Admin user found in database');
            workflowResults.userRegistration.adminExists = true;
        } else {
            console.log('❌ No admin user found');
            workflowResults.userRegistration.adminExists = false;
        }
        
        return true;
        
    } catch (error) {
        console.log('❌ User registration workflow failed:', error.message);
        workflowResults.userRegistration.error = error.message;
        return false;
    }
}

async function testDataAnalysisWorkflow() {
    console.log('\n📊 Testing Data Analysis Workflow...');
    
    const endpoints = [
        { path: '/api/analytics/cases', name: 'Case Analytics' },
        { path: '/api/analytics/performance', name: 'Performance Analytics' },
        { path: '/api/analytics/fraud', name: 'Fraud Detection Analytics' },
        { path: '/api/analytics/ai', name: 'AI Analytics' }
    ];
    
    let successCount = 0;
    
    for (const endpoint of endpoints) {
        try {
            const startTime = Date.now();
            const response = await makeRequest(`${BACKEND_URL}${endpoint.path}`);
            const responseTime = Date.now() - startTime;
            
            if (response.statusCode === 200) {
                console.log(`✅ ${endpoint.name}: OK (${responseTime}ms)`);
                workflowResults.dataAnalysis[endpoint.name.toLowerCase().replace(/\\s+/g, '_')] = {
                    status: 'success',
                    responseTime,
                    dataReceived: !!response.data
                };
                successCount++;
            } else {
                console.log(`❌ ${endpoint.name}: Failed (${response.statusCode})`);
                workflowResults.dataAnalysis[endpoint.name.toLowerCase().replace(/\\s+/g, '_')] = {
                    status: 'failed',
                    statusCode: response.statusCode
                };
            }
            
        } catch (error) {
            console.log(`❌ ${endpoint.name}: Error - ${error.message}`);
            workflowResults.dataAnalysis[endpoint.name.toLowerCase().replace(/\\s+/g, '_')] = {
                status: 'error',
                error: error.message
            };
        }
    }
    
    console.log(`📈 Analysis endpoints working: ${successCount}/${endpoints.length}`);
    return successCount === endpoints.length;
}

async function testSystemPerformanceWorkflow() {
    console.log('\n⚡ Testing System Performance Workflow...');
    
    try {
        // Test metrics endpoint
        const metricsResponse = await makeRequest(`${BACKEND_URL}/metrics`);
        
        if (metricsResponse.statusCode === 200) {
            console.log('✅ Prometheus metrics endpoint accessible');
            workflowResults.systemPerformance.metricsEndpoint = true;
            
            // Check if metrics contain expected data
            const metricsData = metricsResponse.data;
            if (typeof metricsData === 'string' && metricsData.includes('http_requests_total')) {
                console.log('✅ HTTP request metrics found');
                workflowResults.systemPerformance.httpMetrics = true;
            }
        } else {
            console.log('❌ Metrics endpoint failed');
            workflowResults.systemPerformance.metricsEndpoint = false;
        }
        
        // Test system health
        const healthResponse = await makeRequest(`${BACKEND_URL}/health`);
        if (healthResponse.statusCode === 200 && healthResponse.data.status === 'healthy') {
            console.log(`✅ System healthy - Uptime: ${healthResponse.data.uptime}s`);
            workflowResults.systemPerformance.systemHealth = {
                status: 'healthy',
                uptime: healthResponse.data.uptime
            };
        }
        
        return true;
        
    } catch (error) {
        console.log('❌ System performance test failed:', error.message);
        workflowResults.systemPerformance.error = error.message;
        return false;
    }
}

async function testRealTimeMetricsWorkflow() {
    console.log('\n📡 Testing Real-Time Metrics Workflow...');
    
    try {
        // Test real-time analytics endpoint
        const realTimeResponse = await makeRequest(`${BACKEND_URL}/api/analytics/real-time`);
        
        if (realTimeResponse.statusCode === 200) {
            console.log('✅ Real-time metrics endpoint accessible');
            
            const data = realTimeResponse.data;
            if (data && data.success) {
                console.log(`✅ Real-time data structure valid`);
                console.log(`   - Active connections: ${data.data?.activeConnections || 'N/A'}`);
                console.log(`   - Current processing: ${data.data?.currentProcessing || 'N/A'}`);
                
                workflowResults.realTimeMetrics = {
                    accessible: true,
                    dataStructure: 'valid',
                    responseData: data.data
                };
            } else {
                console.log('⚠️  Real-time endpoint returned unexpected format');
                workflowResults.realTimeMetrics = {
                    accessible: true,
                    dataStructure: 'unexpected',
                    rawResponse: data
                };
            }
        } else {
            console.log(`❌ Real-time metrics failed (${realTimeResponse.statusCode})`);
            workflowResults.realTimeMetrics.accessible = false;
        }
        
        return true;
        
    } catch (error) {
        console.log('❌ Real-time metrics test failed:', error.message);
        workflowResults.realTimeMetrics.error = error.message;
        return false;
    }
}

async function testDataExportWorkflow() {
    console.log('\n💾 Testing Data Export Workflow...');
    
    try {
        // Test export endpoint
        const exportResponse = await makeRequest(`${BACKEND_URL}/api/analytics/export?format=json`);
        
        if (exportResponse.statusCode === 200) {
            console.log('✅ Data export endpoint accessible');
            workflowResults.dataExport.accessible = true;
            
            // Check if export returns data
            if (exportResponse.data) {
                console.log('✅ Export returned data');
                workflowResults.dataExport.dataReturned = true;
            } else {
                console.log('⚠️  Export endpoint accessible but no data returned');
                workflowResults.dataExport.dataReturned = false;
            }
        } else {
            console.log(`❌ Data export failed (${exportResponse.statusCode})`);
            workflowResults.dataExport.accessible = false;
        }
        
        return true;
        
    } catch (error) {
        console.log('❌ Data export test failed:', error.message);
        workflowResults.dataExport.error = error.message;
        return false;
    }
}

async function testErrorScenariosWorkflow() {
    console.log('\n🚨 Testing Error Scenarios Workflow...');
    
    const errorTests = [
        { path: '/nonexistent', expectedStatus: 404, name: '404 Error' },
        { path: '/api/analytics', expectedStatus: 400, name: 'Bad Request' },
        { path: '/api/analytics/invalid-endpoint', expectedStatus: 404, name: 'Invalid Analytics Endpoint' }
    ];
    
    let passedTests = 0;
    
    for (const test of errorTests) {
        try {
            const response = await makeRequest(`${BACKEND_URL}${test.path}`);
            
            if (response.statusCode === test.expectedStatus) {
                console.log(`✅ ${test.name}: Correctly returned ${response.statusCode}`);
                workflowResults.errorScenarios[test.name.toLowerCase().replace(/\\s+/g, '_')] = 'passed';
                passedTests++;
            } else {
                console.log(`❌ ${test.name}: Expected ${test.expectedStatus}, got ${response.statusCode}`);
                workflowResults.errorScenarios[test.name.toLowerCase().replace(/\\s+/g, '_')] = 'failed';
            }
            
        } catch (error) {
            console.log(`❌ ${test.name}: Error - ${error.message}`);
            workflowResults.errorScenarios[test.name.toLowerCase().replace(/\\s+/g, '_')] = 'error';
        }
    }
    
    console.log(`🛡️  Error handling tests passed: ${passedTests}/${errorTests.length}`);
    return passedTests === errorTests.length;
}

function generateWorkflowReport() {
    console.log('\\n📋 USER WORKFLOW TEST REPORT');
    console.log('='.repeat(60));
    
    const sections = [
        { name: 'User Registration', data: workflowResults.userRegistration },
        { name: 'Data Analysis', data: workflowResults.dataAnalysis },
        { name: 'System Performance', data: workflowResults.systemPerformance },
        { name: 'Real-Time Metrics', data: workflowResults.realTimeMetrics },
        { name: 'Data Export', data: workflowResults.dataExport },
        { name: 'Error Scenarios', data: workflowResults.errorScenarios }
    ];
    
    let totalWorkflows = 0;
    let successfulWorkflows = 0;
    
    sections.forEach(section => {
        console.log(`\\n🔍 ${section.name}:`);
        totalWorkflows++;
        
        const hasErrors = Object.values(section.data).some(value => 
            value === false || (typeof value === 'object' && value.error) || value === 'failed' || value === 'error'
        );
        
        if (!hasErrors && Object.keys(section.data).length > 0) {
            console.log(`   ✅ PASSED`);
            successfulWorkflows++;
        } else if (Object.keys(section.data).length === 0) {
            console.log(`   ⚠️  NO DATA`);
        } else {
            console.log(`   ❌ ISSUES FOUND`);
        }
        
        // Show key details
        Object.entries(section.data).forEach(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
                console.log(`      ${key}: ${JSON.stringify(value)}`);
            } else {
                console.log(`      ${key}: ${value}`);
            }
        });
    });
    
    const successRate = totalWorkflows > 0 ? (successfulWorkflows / totalWorkflows * 100).toFixed(1) : 0;
    
    console.log('\\n' + '='.repeat(60));
    console.log('🎯 WORKFLOW SUMMARY:');
    console.log(`   Total Workflows: ${totalWorkflows}`);
    console.log(`   Successful: ${successfulWorkflows}`);
    console.log(`   Success Rate: ${successRate}%`);
    
    const overallStatus = successRate >= 80 ? '🟢 EXCELLENT' : 
                         successRate >= 60 ? '🟡 GOOD' : 
                         successRate >= 40 ? '🟠 NEEDS IMPROVEMENT' : '🔴 CRITICAL';
    
    console.log(`   Overall Status: ${overallStatus}`);
    console.log('='.repeat(60));
    
    return {
        totalWorkflows,
        successfulWorkflows,
        successRate: parseFloat(successRate),
        status: overallStatus,
        details: workflowResults
    };
}

// Main execution
async function runUserWorkflowTests() {
    console.log('🚀 AUSTA Cockpit User Workflow Integration Tests');
    console.log('='.repeat(60));
    console.log(`🕐 Started at: ${new Date().toISOString()}`);
    
    // Run all workflow tests
    await testUserRegistrationWorkflow();
    await testDataAnalysisWorkflow();
    await testSystemPerformanceWorkflow();
    await testRealTimeMetricsWorkflow();
    await testDataExportWorkflow();
    await testErrorScenariosWorkflow();
    
    // Generate comprehensive report
    const report = generateWorkflowReport();
    
    // Save results
    require('fs').writeFileSync(
        '/Users/rodrigo/claude-projects/QualityControl/QualityControl/user-workflow-results.json',
        JSON.stringify(report, null, 2)
    );
    
    console.log(`\\n💾 Workflow results saved to: user-workflow-results.json`);
    console.log(`🕐 Completed at: ${new Date().toISOString()}`);
    
    return report;
}

// Execute if run directly
if (require.main === module) {
    runUserWorkflowTests().catch(error => {
        console.error('❌ Workflow test execution failed:', error);
        process.exit(1);
    });
}

module.exports = { runUserWorkflowTests, workflowResults };