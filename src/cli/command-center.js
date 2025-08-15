#!/usr/bin/env node

const readline = require('readline');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Command Center for TXF Automation
class CommandCenter {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async showMenu() {
        console.clear();
        console.log('╔══════════════════════════════════════════════╗');
        console.log('║         TXF AUTOMATION COMMAND CENTER        ║');
        console.log('╚══════════════════════════════════════════════╝');
        console.log('');
        console.log('📊 DASHBOARD');
        console.log('  1. Open Web Dashboard');
        console.log('  2. Check System Health');
        console.log('  3. View Today\'s Changes');
        console.log('');
        console.log('🔄 OPERATIONS');
        console.log('  4. Run Manual Export (FLXPoint)');
        console.log('  5. Process Latest Export');
        console.log('  6. Run Complete Pipeline');
        console.log('');
        console.log('🛠️ MAINTENANCE');
        console.log('  7. Clean Old Files');
        console.log('  8. Backup Database');
        console.log('  9. View Logs');
        console.log('');
        console.log('⚙️ SETTINGS');
        console.log('  10. Test Export (1-minute wait)');
        console.log('  11. Configure Schedule');
        console.log('  12. Update Settings');
        console.log('');
        console.log('  0. Exit');
        console.log('');
        
        const answer = await this.prompt('Select option (0-12): ');
        await this.handleOption(answer);
    }

    prompt(question) {
        return new Promise(resolve => {
            this.rl.question(question, resolve);
        });
    }

    async handleOption(option) {
        console.log('');
        
        switch(option) {
            case '1':
                console.log('🌐 Opening dashboard...');
                exec('open http://localhost:3000');
                await this.waitAndContinue();
                break;
                
            case '2':
                console.log('🔍 Running health check...\n');
                await this.runCommand('node monitor.js');
                await this.waitAndContinue();
                break;
                
            case '3':
                console.log('📈 Today\'s inventory changes:\n');
                await this.showTodayChanges();
                await this.waitAndContinue();
                break;
                
            case '4':
                console.log('📤 Starting FLXPoint export (15 minutes)...\n');
                await this.runCommand('node flxpoint-export-reliable.js');
                await this.waitAndContinue();
                break;
                
            case '5':
                console.log('📊 Processing latest export...\n');
                await this.runCommand('node inventory-tracker.js');
                await this.waitAndContinue();
                break;
                
            case '6':
                console.log('🚀 Running complete pipeline...\n');
                await this.runCommand('node daily-inventory-run.js');
                await this.waitAndContinue();
                break;
                
            case '7':
                console.log('🧹 Cleaning old files...\n');
                await this.runCommand('node utils/cleanup.js');
                await this.waitAndContinue();
                break;
                
            case '8':
                console.log('💾 Backing up database...\n');
                await this.backupDatabase();
                await this.waitAndContinue();
                break;
                
            case '9':
                console.log('📄 Recent logs:\n');
                await this.showLogs();
                await this.waitAndContinue();
                break;
                
            case '10':
                console.log('🧪 Running test export (1-minute wait)...\n');
                await this.runCommand('TEST_MODE=true node flxpoint-export-reliable.js');
                await this.waitAndContinue();
                break;
                
            case '11':
                console.log('📅 Opening schedule configuration...\n');
                await this.runCommand('./schedule-setup.sh');
                await this.waitAndContinue();
                break;
                
            case '12':
                console.log('⚙️ Opening settings file...\n');
                exec('open .env');
                await this.waitAndContinue();
                break;
                
            case '0':
                console.log('👋 Goodbye!');
                this.rl.close();
                process.exit(0);
                break;
                
            default:
                console.log('Invalid option. Please try again.');
                await this.waitAndContinue();
        }
    }

    runCommand(command) {
        return new Promise((resolve) => {
            const child = exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error: ${error.message}`);
                } else {
                    console.log(stdout);
                    if (stderr) console.error(stderr);
                }
                resolve();
            });
            
            // Stream output in real-time
            child.stdout?.on('data', (data) => process.stdout.write(data));
            child.stderr?.on('data', (data) => process.stderr.write(data));
        });
    }

    async showTodayChanges() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const reportFile = path.join(__dirname, 'reports', `daily-changes-${today}.csv`);
            
            // Check if file exists
            await fs.access(reportFile);
            
            // Read and display first 10 lines
            const content = await fs.readFile(reportFile, 'utf8');
            const lines = content.split('\n').slice(0, 11);
            console.log(lines.join('\n'));
            console.log('...\n');
            
            // Count total changes
            const totalLines = content.split('\n').length - 2; // Minus header and empty line
            console.log(`Total changes: ${totalLines}`);
        } catch (error) {
            console.log('No changes found for today. Run export first.');
        }
    }

    async backupDatabase() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const backupFile = `inventory-backup-${timestamp}.db`;
        
        try {
            await fs.copyFile('inventory.db', backupFile);
            console.log(`✅ Database backed up to: ${backupFile}`);
            
            // Get file size
            const stats = await fs.stat(backupFile);
            console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        } catch (error) {
            console.error(`❌ Backup failed: ${error.message}`);
        }
    }

    async showLogs() {
        try {
            const logsDir = path.join(__dirname, 'logs');
            const files = await fs.readdir(logsDir);
            
            // Find most recent log
            const logFiles = files.filter(f => f.endsWith('.log')).sort().reverse();
            
            if (logFiles.length > 0) {
                const latestLog = path.join(logsDir, logFiles[0]);
                const content = await fs.readFile(latestLog, 'utf8');
                const lines = content.split('\n').slice(-20); // Last 20 lines
                
                console.log(`📄 ${logFiles[0]}:`);
                console.log('─'.repeat(50));
                console.log(lines.join('\n'));
            } else {
                console.log('No log files found.');
            }
        } catch (error) {
            console.log('Logs directory not found.');
        }
    }

    async waitAndContinue() {
        await this.prompt('\nPress Enter to continue...');
        await this.showMenu();
    }

    async checkStatus() {
        console.log('🔍 Quick Status Check\n');
        
        // Check if server is running
        try {
            await this.runCommand('curl -s http://localhost:3000 > /dev/null 2>&1');
            console.log('✅ Server: Running');
        } catch {
            console.log('❌ Server: Not running (run: npm start)');
        }
        
        // Check database
        try {
            const stats = await fs.stat('inventory.db');
            console.log(`✅ Database: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        } catch {
            console.log('❌ Database: Not found');
        }
        
        // Check exports
        try {
            const exportsDir = path.join(__dirname, 'exports');
            const files = await fs.readdir(exportsDir);
            const csvFiles = files.filter(f => f.endsWith('.csv'));
            console.log(`✅ Exports: ${csvFiles.length} files`);
        } catch {
            console.log('❌ Exports: Directory not found');
        }
        
        console.log('');
    }

    async start() {
        // Initial status check
        await this.checkStatus();
        
        // Show menu
        await this.showMenu();
    }
}

// Run command center
const center = new CommandCenter();
center.start().catch(console.error);