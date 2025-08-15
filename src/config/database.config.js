/**
 * Database Configuration
 * Centralized database settings and connection parameters
 */

const path = require('path');

module.exports = {
    // Database file location
    dbPath: path.join(__dirname, '../../inventory.db'),
    
    // Connection settings
    connection: {
        filename: path.join(__dirname, '../../inventory.db'),
        driver: 'sqlite3'
    },
    
    // Query settings
    queryTimeout: 30000,
    
    // Pagination defaults
    pagination: {
        defaultLimit: 100,
        maxLimit: 200000
    },
    
    // Table names
    tables: {
        products: 'products',
        inventorySnapshots: 'inventory_snapshots_v2',
        dailyChanges: 'daily_changes',
        exportLogs: 'export_logs',
        notifications: 'notifications',
        settings: 'settings'
    },
    
    // Index configurations
    indexes: {
        products: ['sku', 'upc', 'category1'],
        inventorySnapshots: ['date', 'sku'],
        dailyChanges: ['date', 'sku', 'absolute_change']
    }
};