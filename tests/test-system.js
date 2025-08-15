#!/usr/bin/env node

/**
 * System Test Script for TXF Inventory Tracker
 * Tests all major components and API endpoints
 */

const http = require('http');

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

// Test configuration
const BASE_URL = 'http://localhost:3000';
let testsPassed = 0;
let testsFailed = 0;

// Helper function to make HTTP requests
function makeRequest(path, method = 'GET') {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({ status: res.statusCode, data: jsonData });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// Test runner
async function runTest(name, testFn) {
    process.stdout.write(`${colors.cyan}Testing ${name}...${colors.reset} `);
    try {
        await testFn();
        console.log(`${colors.green}✓ PASSED${colors.reset}`);
        testsPassed++;
    } catch (error) {
        console.log(`${colors.red}✗ FAILED${colors.reset}`);
        console.log(`  ${colors.red}Error: ${error.message}${colors.reset}`);
        testsFailed++;
    }
}

// Individual test cases
async function testServerHealth() {
    const response = await makeRequest('/');
    if (response.status !== 200) {
        throw new Error(`Server returned status ${response.status}`);
    }
}

async function testInventoryAPI() {
    const response = await makeRequest('/api/inventory/current?limit=5');
    if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
    }
    if (!response.data.data || !Array.isArray(response.data.data)) {
        throw new Error('Invalid response structure');
    }
    if (response.data.total !== 112841) {
        throw new Error(`Expected 112841 products, got ${response.data.total}`);
    }
}

async function testPaginatedInventory() {
    const response = await makeRequest('/api/inventory/paginated?page=1&limit=10');
    if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
    }
    if (!response.data.data || !Array.isArray(response.data.data)) {
        throw new Error('Invalid response structure');
    }
    if (!response.data.total || !response.data.page) {
        throw new Error('Missing pagination metadata');
    }
}

async function testDailyChanges() {
    const today = new Date().toISOString().split('T')[0];
    const response = await makeRequest(`/api/changes/daily/${today}`);
    if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
    }
    if (!Array.isArray(response.data)) {
        throw new Error('Response should be an array');
    }
}

async function testWeeklyChanges() {
    const response = await makeRequest('/api/changes/weekly');
    if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
    }
    if (!Array.isArray(response.data)) {
        throw new Error('Response should be an array');
    }
}

async function testTopMovers() {
    const response = await makeRequest('/api/inventory/top-movers?limit=10');
    if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
    }
    if (!response.data.movers || !Array.isArray(response.data.movers)) {
        throw new Error('Invalid response structure');
    }
}

async function testLowStock() {
    const response = await makeRequest('/api/inventory/low-stock?threshold=10');
    if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
    }
    if (!response.data.items || !Array.isArray(response.data.items)) {
        throw new Error('Invalid response structure');
    }
}

async function testSearch() {
    const response = await makeRequest('/api/inventory/search?q=KSN&limit=5');
    if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
    }
    if (!response.data.results || !Array.isArray(response.data.results)) {
        throw new Error('Invalid response structure');
    }
}

async function testAnalytics() {
    const response = await makeRequest('/api/analytics?period=weekly');
    if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
    }
    if (!response.data.dailyTrends || !response.data.topMovers) {
        throw new Error('Invalid analytics response structure');
    }
}

async function testExportLogs() {
    const response = await makeRequest('/api/exports/logs?limit=10');
    if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
    }
    if (!Array.isArray(response.data)) {
        throw new Error('Response should be an array');
    }
}

async function testSettings() {
    const response = await makeRequest('/api/settings');
    if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
    }
    if (typeof response.data !== 'object') {
        throw new Error('Settings should be an object');
    }
}

// Performance test
async function testLoadTime() {
    const start = Date.now();
    const response = await makeRequest('/api/inventory/current?limit=1000');
    const duration = Date.now() - start;
    
    if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
    }
    
    if (duration > 3000) {
        throw new Error(`Load time too slow: ${duration}ms (should be < 3000ms)`);
    }
    
    console.log(`  ${colors.blue}(Load time: ${duration}ms)${colors.reset}`);
}

// Main test runner
async function runAllTests() {
    console.log(`\n${colors.blue}═══════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.blue}     TXF Inventory Tracker - System Test Suite${colors.reset}`);
    console.log(`${colors.blue}═══════════════════════════════════════════════════${colors.reset}\n`);

    // Check if server is running
    try {
        await makeRequest('/');
    } catch (error) {
        console.log(`${colors.red}❌ Server is not running at ${BASE_URL}${colors.reset}`);
        console.log(`${colors.yellow}Please start the server with: npm start${colors.reset}\n`);
        process.exit(1);
    }

    // Run all tests
    await runTest('Server Health', testServerHealth);
    await runTest('Inventory API', testInventoryAPI);
    await runTest('Paginated Inventory', testPaginatedInventory);
    await runTest('Daily Changes', testDailyChanges);
    await runTest('Weekly Changes', testWeeklyChanges);
    await runTest('Top Movers', testTopMovers);
    await runTest('Low Stock Items', testLowStock);
    await runTest('Search Functionality', testSearch);
    await runTest('Analytics API', testAnalytics);
    await runTest('Export Logs', testExportLogs);
    await runTest('Settings API', testSettings);
    await runTest('Performance (1000 items)', testLoadTime);

    // Summary
    console.log(`\n${colors.blue}═══════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.blue}                   TEST SUMMARY${colors.reset}`);
    console.log(`${colors.blue}═══════════════════════════════════════════════════${colors.reset}`);
    
    const total = testsPassed + testsFailed;
    const passRate = ((testsPassed / total) * 100).toFixed(1);
    
    console.log(`${colors.green}✓ Passed: ${testsPassed}${colors.reset}`);
    console.log(`${colors.red}✗ Failed: ${testsFailed}${colors.reset}`);
    console.log(`${colors.cyan}Pass Rate: ${passRate}%${colors.reset}\n`);
    
    if (testsFailed === 0) {
        console.log(`${colors.green}🎉 All tests passed successfully!${colors.reset}\n`);
    } else {
        console.log(`${colors.yellow}⚠️  Some tests failed. Please review the errors above.${colors.reset}\n`);
        process.exit(1);
    }
}

// Run tests
runAllTests().catch(console.error);