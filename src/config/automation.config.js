/**
 * Automation Configuration
 * Settings for Playwright and FLXPoint automation
 */

const path = require('path');

module.exports = {
    // Playwright settings
    playwright: {
        headless: process.env.HEADLESS !== 'false',
        slowMo: parseInt(process.env.SLOW_MO || '0'),
        timeout: 60000,
        authStatePath: path.join(__dirname, '../../auth/flxpoint-auth.json')
    },
    
    // FLXPoint settings
    flxpoint: {
        baseUrl: 'https://app.flxpoint.com',
        loginUrl: 'https://app.flxpoint.com/login',
        productsUrl: 'https://app.flxpoint.com/products',
        exportWaitTime: parseInt(process.env.EXPORT_WAIT_TIME || '900000'), // 15 minutes default
        retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
        retryDelay: 30000 // 30 seconds between retries
    },
    
    // Export settings
    export: {
        outputDir: path.join(__dirname, '../../exports'),
        filePattern: 'FBAExport_*.csv',
        processOnDownload: true,
        keepDays: parseInt(process.env.EXPORT_RETENTION || '30')
    },
    
    // Scheduling
    schedule: {
        dailyTime: '06:00', // 6:00 AM
        timezone: 'America/New_York',
        enabled: process.env.SCHEDULE_ENABLED !== 'false'
    },
    
    // Debug settings
    debug: {
        enabled: process.env.DEBUG_MODE === 'true',
        screenshot: process.env.SAVE_SCREENSHOTS === 'true',
        screenshotDir: path.join(__dirname, '../../logs/screenshots'),
        verbose: process.env.VERBOSE === 'true'
    }
};