#!/usr/bin/env node

const { exec } = require('child_process');
const path = require('path');
const InventoryTracker = require('../database/inventory-tracker');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config');
const { verifyExport } = require('../utils/verifyExport');

async function runDailyInventoryUpdate() {
  const isTestMode = process.argv.includes('--test');
  console.log('=================================');
  console.log(`DAILY INVENTORY UPDATE ${isTestMode ? '(TEST MODE)' : ''}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('=================================\n');
  
  try {
    // Step 1: Run the FLXPoint export
    console.log('Step 1: Running FLXPoint export...');
    console.log(`This will take approximately ${isTestMode ? '5 minutes' : '20 minutes'}...\n`);
    
    const exportCommand = isTestMode
        ? 'TEST_MODE=true node src/automation/flxpoint-export-final.js'
        : 'node src/automation/flxpoint-export-final.js';

    await new Promise((resolve, reject) => {
      const exportProcess = exec(exportCommand, (error, stdout, stderr) => {
        if (error) {
          console.error('Export failed:', error);
          reject(error);
          return;
        }
        console.log(stdout);
        if (stderr) console.error('Export warnings:', stderr);
        resolve();
      });
      
      // Stream output in real-time
      exportProcess.stdout.on('data', (data) => {
        process.stdout.write(data);
      });
      
      exportProcess.stderr.on('data', (data) => {
        process.stderr.write(data);
      });
    });
    
    console.log('\n=================================');
    console.log('Step 2: Processing inventory changes...\n');
    
    // Step 2: Process the export with inventory tracker
    const db = new sqlite3.Database(config.database.dbPath);
    const tracker = new InventoryTracker();
    
    // Find the latest export
    const fs = require('fs');
    const exportsDir = path.join(__dirname, '../../exports');
    const files = fs.readdirSync(exportsDir)
      .filter(f => f.startsWith('flxpoint-export-'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      throw new Error('No export files found');
    }
    
    const latestExport = path.join(exportsDir, files[0]);
    console.log(`Processing export: ${files[0]}\n`);

    // Step 2.5: Verify the export file
    await verifyExport(latestExport);
    
    const changes = await tracker.processDailyExport(latestExport, db);
    
    // Step 3: Generate weekly report on Mondays
    const today = new Date();
    if (today.getDay() === 1) { // Monday
      console.log('\n=================================');
      console.log('Generating weekly report...\n');
      await tracker.generateWeeklyReport();
    }
    
    // Step 4: Generate monthly report on the 1st
    if (today.getDate() === 1) {
      console.log('\n=================================');
      console.log('Generating monthly report...\n');
      // TODO: Implement monthly report
    }
    
    console.log('\n=================================');
    console.log('DAILY UPDATE COMPLETE');
    console.log('=================================\n');
    
    db.close();
    
    // Send notification or email if configured
    if (process.env.NOTIFICATION_WEBHOOK) {
      await sendNotification(changes);
    }
    
  } catch (error) {
    console.error('Daily inventory update failed:', error);
    process.exit(1);
  }
}

// Send notification about daily changes
async function sendNotification(changes) {
  // This is a placeholder for notification logic
  // You could integrate with Slack, email, etc.
  console.log('Notification would be sent with', changes.length, 'changes');
}

// Run the daily update
if (require.main === module) {
  runDailyInventoryUpdate();
}