#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
require('dotenv').config();

class SystemMonitor {
    constructor() {
        this.db = new sqlite3.Database('./inventory.db');
        this.checks = {
            database: { status: 'unknown', lastCheck: null },
            exports: { status: 'unknown', lastCheck: null },
            diskSpace: { status: 'unknown', lastCheck: null },
            server: { status: 'unknown', lastCheck: null }
        };
    }

    async runHealthChecks() {
        console.log('\n🔍 TXF Automation System Health Check\n');
        console.log('=' .repeat(50));
        
        const results = {
            timestamp: new Date().toISOString(),
            checks: {}
        };

        // 1. Check Database
        results.checks.database = await this.checkDatabase();
        
        // 2. Check Recent Exports
        results.checks.exports = await this.checkExports();
        
        // 3. Check Disk Space
        results.checks.diskSpace = await this.checkDiskSpace();
        
        // 4. Check Server Status
        results.checks.server = await this.checkServer();
        
        // 5. Check Data Freshness
        results.checks.dataFreshness = await this.checkDataFreshness();
        
        // Generate Report
        this.generateReport(results);
        
        // Send alerts if needed
        await this.sendAlerts(results);
        
        return results;
    }

    async checkDatabase() {
        try {
            const stats = await new Promise((resolve, reject) => {
                this.db.get(`
                    SELECT 
                        (SELECT COUNT(*) FROM products) as products,
                        (SELECT COUNT(*) FROM inventory_snapshots) as snapshots,
                        (SELECT COUNT(*) FROM daily_changes) as changes,
                        (SELECT MAX(date) FROM inventory_snapshots) as latest_snapshot
                `, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            const dbFile = await fs.stat('./inventory.db');
            const sizeMB = (dbFile.size / 1024 / 1024).toFixed(2);

            return {
                status: 'healthy',
                products: stats.products,
                snapshots: stats.snapshots,
                changes: stats.changes,
                latestSnapshot: stats.latest_snapshot,
                size: `${sizeMB} MB`,
                message: `Database operational with ${stats.products.toLocaleString()} products`
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Database error: ${error.message}`
            };
        }
    }

    async checkExports() {
        try {
            const exportsDir = path.join(__dirname, 'exports');
            const files = await fs.readdir(exportsDir);
            const csvFiles = files.filter(f => f.endsWith('.csv'));
            
            if (csvFiles.length === 0) {
                return {
                    status: 'warning',
                    message: 'No export files found'
                };
            }

            // Get latest export
            const latestFile = csvFiles.sort().reverse()[0];
            const stats = await fs.stat(path.join(exportsDir, latestFile));
            const hoursSinceExport = (Date.now() - stats.mtime) / (1000 * 60 * 60);

            return {
                status: hoursSinceExport < 25 ? 'healthy' : 'warning',
                latestExport: latestFile,
                exportAge: `${hoursSinceExport.toFixed(1)} hours`,
                totalExports: csvFiles.length,
                message: hoursSinceExport < 25 
                    ? 'Exports are up to date' 
                    : `⚠️ No export in ${hoursSinceExport.toFixed(0)} hours`
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Export check failed: ${error.message}`
            };
        }
    }

    async checkDiskSpace() {
        try {
            const { exec } = require('child_process');
            const diskInfo = await new Promise((resolve, reject) => {
                exec('df -h .', (error, stdout) => {
                    if (error) reject(error);
                    else {
                        const lines = stdout.trim().split('\n');
                        const data = lines[1].split(/\s+/);
                        resolve({
                            used: data[2],
                            available: data[3],
                            usePercent: parseInt(data[4])
                        });
                    }
                });
            });

            return {
                status: diskInfo.usePercent < 80 ? 'healthy' : 'warning',
                used: diskInfo.used,
                available: diskInfo.available,
                usePercent: `${diskInfo.usePercent}%`,
                message: diskInfo.usePercent < 80 
                    ? 'Sufficient disk space available'
                    : `⚠️ Disk usage high: ${diskInfo.usePercent}%`
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Disk check failed: ${error.message}`
            };
        }
    }

    async checkServer() {
        try {
            const response = await axios.get('http://localhost:3000/api/inventory/current?limit=1', {
                timeout: 5000
            });

            return {
                status: response.status === 200 ? 'healthy' : 'warning',
                responseTime: response.headers['x-response-time'] || 'N/A',
                message: 'Server is responding'
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Server not responding: ${error.message}`
            };
        }
    }

    async checkDataFreshness() {
        try {
            // Check if we have today's data
            const today = new Date().toISOString().split('T')[0];
            const changes = await new Promise((resolve, reject) => {
                this.db.get(
                    'SELECT COUNT(*) as count FROM daily_changes WHERE date = ?',
                    [today],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row.count);
                    }
                );
            });

            return {
                status: changes > 0 ? 'healthy' : 'warning',
                todaysChanges: changes,
                message: changes > 0 
                    ? `${changes} changes tracked today`
                    : '⚠️ No changes tracked today'
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Data freshness check failed: ${error.message}`
            };
        }
    }

    generateReport(results) {
        console.log('\n📊 Health Check Results:\n');
        
        Object.entries(results.checks).forEach(([check, result]) => {
            const icon = {
                healthy: '✅',
                warning: '⚠️',
                error: '❌',
                unknown: '❓'
            }[result.status];
            
            console.log(`${icon} ${check.toUpperCase()}: ${result.message}`);
            
            if (result.status !== 'healthy') {
                Object.entries(result).forEach(([key, value]) => {
                    if (key !== 'status' && key !== 'message') {
                        console.log(`   ${key}: ${value}`);
                    }
                });
            }
        });
        
        console.log('\n' + '=' .repeat(50));
        
        // Overall health
        const unhealthy = Object.values(results.checks)
            .filter(c => c.status === 'error' || c.status === 'warning');
        
        if (unhealthy.length === 0) {
            console.log('✅ System Status: HEALTHY');
        } else if (unhealthy.some(c => c.status === 'error')) {
            console.log('❌ System Status: CRITICAL - Immediate attention required');
        } else {
            console.log('⚠️ System Status: WARNING - Review needed');
        }
        
        console.log('=' .repeat(50) + '\n');
    }

    async sendAlerts(results) {
        const criticalIssues = Object.entries(results.checks)
            .filter(([_, check]) => check.status === 'error');
        
        if (criticalIssues.length > 0) {
            console.log('🚨 SENDING ALERTS for critical issues:');
            criticalIssues.forEach(([name, issue]) => {
                console.log(`   - ${name}: ${issue.message}`);
            });
            
            // Here you would send actual alerts (email, Slack, etc.)
            if (process.env.NOTIFICATION_EMAIL) {
                // Send email alert
                console.log(`   📧 Alert sent to: ${process.env.NOTIFICATION_EMAIL}`);
            }
        }
    }

    async generateMetricsReport() {
        console.log('\n📈 System Metrics Report\n');
        console.log('=' .repeat(50));
        
        try {
            // Performance metrics
            const metrics = await new Promise((resolve, reject) => {
                this.db.get(`
                    SELECT 
                        AVG(absolute_change) as avg_daily_movement,
                        MAX(absolute_change) as max_movement,
                        COUNT(DISTINCT date) as days_tracked,
                        COUNT(DISTINCT sku) as unique_products_changed
                    FROM daily_changes
                    WHERE date >= date('now', '-30 days')
                `, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            console.log('📊 30-Day Metrics:');
            console.log(`   Average Daily Movement: ${metrics.avg_daily_movement?.toFixed(2) || 0} units`);
            console.log(`   Maximum Movement: ${metrics.max_movement || 0} units`);
            console.log(`   Days Tracked: ${metrics.days_tracked}`);
            console.log(`   Unique Products Changed: ${metrics.unique_products_changed}`);
            
            // Export success rate
            const exportLogs = await new Promise((resolve, reject) => {
                this.db.all(
                    `SELECT status, COUNT(*) as count 
                     FROM export_logs 
                     WHERE timestamp >= datetime('now', '-30 days')
                     GROUP BY status`,
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            
            const totalExports = exportLogs.reduce((sum, log) => sum + log.count, 0);
            const successfulExports = exportLogs.find(l => l.status === 'success')?.count || 0;
            const successRate = totalExports > 0 ? (successfulExports / totalExports * 100).toFixed(1) : 0;
            
            console.log('\n📦 Export Metrics:');
            console.log(`   Success Rate: ${successRate}%`);
            console.log(`   Total Exports: ${totalExports}`);
            console.log(`   Successful: ${successfulExports}`);
            
        } catch (error) {
            console.error('Error generating metrics:', error);
        }
        
        console.log('=' .repeat(50) + '\n');
    }

    close() {
        this.db.close();
    }
}

// Run monitor
async function main() {
    const monitor = new SystemMonitor();
    
    try {
        // Run health checks
        await monitor.runHealthChecks();
        
        // Generate metrics report
        await monitor.generateMetricsReport();
        
        // Check if running as scheduled task
        if (process.argv.includes('--scheduled')) {
            // Log to file for scheduled runs
            const logEntry = {
                timestamp: new Date().toISOString(),
                status: 'completed'
            };
            await fs.appendFile(
                'logs/monitor.log',
                JSON.stringify(logEntry) + '\n'
            );
        }
        
    } catch (error) {
        console.error('Monitor error:', error);
        process.exit(1);
    } finally {
        monitor.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = SystemMonitor;