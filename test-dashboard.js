#!/usr/bin/env node

const http = require('http');

const BASE_URL = 'http://localhost:4000';

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = res.headers['content-type']?.includes('json') ? JSON.parse(data) : data;
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        }).on('error', reject);
    });
}

async function runTests() {
    console.log('\n=== TXF Dashboard Test Suite ===\n');
    
    const tests = [
        {
            name: 'Server Health Check',
            url: '/',
            check: (res) => res.status === 200
        },
        {
            name: 'API Stats Endpoint',
            url: '/api/inventory/stats',
            check: (res) => res.data.totalProducts === 112841
        },
        {
            name: 'API Paginated Endpoint',
            url: '/api/inventory/paginated?page=1&limit=10',
            check: (res) => res.data.total === 112841 && res.data.data.length === 10
        },
        {
            name: 'Grid JavaScript Loads',
            url: '/js/inventory.js',
            check: (res) => res.data.includes('createInfiniteDatasource')
        },
        {
            name: 'AG-Grid CSS Loads',
            url: '/',
            check: (res) => res.data.includes('ag-grid-community@34.1.1/styles/ag-grid.css')
        },
        {
            name: 'Dashboard HTML Structure',
            url: '/',
            check: (res) => res.data.includes('inventoryGrid') && res.data.includes('ag-theme-alpine')
        }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            const res = await httpGet(BASE_URL + test.url);
            if (test.check(res)) {
                console.log(`✓ ${test.name}`);
                passed++;
            } else {
                console.log(`✗ ${test.name} - Check failed`);
                failed++;
            }
        } catch (error) {
            console.log(`✗ ${test.name} - ${error.message}`);
            failed++;
        }
    }
    
    console.log('\n=== Test Results ===');
    console.log(`Passed: ${passed}`);
    if (failed > 0) {
        console.log(`Failed: ${failed}`);
    }
    
    // Additional info
    console.log('\n=== System Info ===');
    try {
        const stats = await httpGet(BASE_URL + '/api/inventory/stats');
        console.log(`Total Products: ${stats.data.totalProducts.toLocaleString()}`);
        console.log(`Total Value: $${stats.data.totalValue.toFixed(2)}`);
        console.log(`Out of Stock: ${stats.data.outOfStock.toLocaleString()}`);
        console.log(`Low Stock: ${stats.data.lowStock}`);
    } catch (error) {
        console.log('Could not fetch stats');
    }
    
    if (failed === 0) {
        console.log('\n✅ All tests passed! Dashboard is working correctly.');
        console.log(`\nOpen dashboard at: ${BASE_URL}`);
    } else {
        console.log('\n❌ Some tests failed. Please check the errors above.');
    }
}

runTests().catch(console.error);