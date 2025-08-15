const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

class InventoryTracker {
  constructor() {
    this.dataDir = path.join(__dirname, '../../inventory-data');
    this.exportsDir = path.join(__dirname, '../../exports');
    this.reportsDir = path.join(__dirname, '../../reports');
    this.masterFile = path.join(__dirname, '../../exports/Original-export-8-8-25.csv');
    
    // Create directories if they don't exist
    [this.dataDir, this.reportsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // Load the master file with product names and UPCs
  async loadMasterData() {
    const masterData = {};
    return new Promise((resolve, reject) => {
      fs.createReadStream(this.masterFile)
        .pipe(csv())
        .on('data', (row) => {
          // Skip rows with empty or null SKU values
          const sku = row['Master SKU'];
          if (sku && sku.trim() !== '') {
            masterData[sku] = {
              sku: sku,
              title: row['Title'],
              upc: row['UPC'],
              category1: row['Category 1'],
              category2: row['Category 2'],
              defaultPrice: parseFloat(row['Default List Price']) || 0
            };
          }
        })
        .on('end', () => resolve(masterData))
        .on('error', reject);
    });
  }

  // Load a daily export file
  async loadDailyExport(filePath) {
    const dailyData = {};
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          // Skip rows with empty or null SKU values to prevent database constraint errors
          const sku = row['Master SKU'];
          if (sku && sku.trim() !== '') {
            dailyData[sku] = {
              sku: sku,
              quantity: parseInt(row['Quantity']) || 0,
              estimatedCost: parseFloat(row['Estimated Cost']) || 0
            };
          }
        })
        .on('end', () => resolve(dailyData))
        .on('error', reject);
    });
  }

  // Calculate daily changes between two datasets
  calculateDailyChanges(yesterdayData, todayData, masterData) {
    const changes = [];
    const allSkus = new Set([...Object.keys(yesterdayData), ...Object.keys(todayData)]);
    
    allSkus.forEach(sku => {
      const yesterday = yesterdayData[sku] || { quantity: 0, estimatedCost: 0 };
      const today = todayData[sku] || { quantity: 0, estimatedCost: 0 };
      const master = masterData[sku] || {};
      
      const quantityChange = today.quantity - yesterday.quantity;
      const absoluteChange = Math.abs(quantityChange);
      
      // Only track items with changes
      if (absoluteChange > 0) {
        changes.push({
          sku,
          title: master.title || 'Unknown',
          upc: master.upc || '',
          category1: master.category1 || '',
          category2: master.category2 || '',
          yesterdayQty: yesterday.quantity,
          todayQty: today.quantity,
          quantityChange,
          absoluteChange,
          percentChange: yesterday.quantity > 0 ? 
            ((quantityChange / yesterday.quantity) * 100).toFixed(2) : 'New',
          estimatedCost: today.estimatedCost,
          totalValue: today.quantity * today.estimatedCost,
          changeType: quantityChange > 0 ? 'INCREASE' : 'DECREASE'
        });
      }
    });
    
    // Sort by absolute change (most movement first)
    changes.sort((a, b) => b.absoluteChange - a.absoluteChange);
    
    return changes;
  }

  // Process today's export and compare with yesterday
  async processDailyExport(exportFilePath, db) {
    console.log('Processing daily export...');
    
    // Load master data
    const masterData = await this.loadMasterData();
    
    // Load today's data
    const todayData = await this.loadDailyExport(exportFilePath);
    const today = new Date().toISOString().split('T')[0];
    
    // Save today's data snapshot to the database
    await this.saveSnapshotToDB(todayData, today, db);
    
    // Find yesterday's snapshot from the database
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const yesterdayData = await this.loadSnapshotFromDB(yesterdayStr, db);
    
    let changes = [];
    if (Object.keys(yesterdayData).length > 0) {
      changes = this.calculateDailyChanges(yesterdayData, todayData, masterData);
      
      // Save daily changes report
      await this.saveDailyReport(changes, today);
    } else {
      console.log('No previous data found. This is the first snapshot.');
    }
    
    return changes;
  }

  async saveSnapshotToDB(data, date, db) {
      const stmt = db.prepare('INSERT OR REPLACE INTO inventory_snapshots_v2 (date, sku, quantity, estimated_cost) VALUES (?, ?, ?, ?)');
      db.run('BEGIN TRANSACTION');
      
      let savedCount = 0;
      let skippedCount = 0;
      
      for (const sku in data) {
          const item = data[sku];
          // Additional validation to prevent constraint errors
          if (item.sku && item.sku.trim() !== '') {
              try {
                  stmt.run(date, item.sku, item.quantity || 0, item.estimatedCost || 0);
                  savedCount++;
              } catch (err) {
                  console.warn(`Failed to save SKU ${item.sku}: ${err.message}`);
                  skippedCount++;
              }
          } else {
              skippedCount++;
          }
      }
      
      stmt.finalize();
      db.run('COMMIT');
      console.log(`Snapshot for ${date} saved to database. Saved: ${savedCount}, Skipped: ${skippedCount}`);
  }

  async loadSnapshotFromDB(date, db) {
      return new Promise((resolve, reject) => {
          const data = {};
          db.each('SELECT sku, quantity, estimated_cost FROM inventory_snapshots_v2 WHERE date = ?', [date], (err, row) => {
              if (err) reject(err);
              data[row.sku] = {
                  sku: row.sku,
                  quantity: row.quantity,
                  estimatedCost: row.estimated_cost
              };
          }, (err) => {
              if (err) reject(err);
              resolve(data);
          });
      });
  }

  // Save daily report
  async saveDailyReport(changes, date) {
    const reportPath = path.join(this.reportsDir, `daily-changes-${date}.csv`);
    
    const csvWriter = createCsvWriter({
      path: reportPath,
      header: [
        { id: 'sku', title: 'SKU' },
        { id: 'title', title: 'Product Title' },
        { id: 'upc', title: 'UPC' },
        { id: 'category1', title: 'Category 1' },
        { id: 'category2', title: 'Category 2' },
        { id: 'yesterdayQty', title: 'Yesterday Qty' },
        { id: 'todayQty', title: 'Today Qty' },
        { id: 'quantityChange', title: 'Change' },
        { id: 'absoluteChange', title: 'Absolute Change' },
        { id: 'percentChange', title: 'Percent Change' },
        { id: 'changeType', title: 'Type' },
        { id: 'estimatedCost', title: 'Unit Cost' },
        { id: 'totalValue', title: 'Total Value' }
      ]
    });
    
    await csvWriter.writeRecords(changes);
    console.log(`Daily report saved to: ${reportPath}`);
    
    // Also save a summary
    this.generateDailySummary(changes, date);
  }

  // Generate daily summary
  generateDailySummary(changes, date) {
    const summary = {
      date,
      totalProductsChanged: changes.length,
      totalAbsoluteChange: changes.reduce((sum, c) => sum + c.absoluteChange, 0),
      increases: changes.filter(c => c.changeType === 'INCREASE').length,
      decreases: changes.filter(c => c.changeType === 'DECREASE').length,
      topMovers: changes.slice(0, 10).map(c => ({
        sku: c.sku,
        title: c.title,
        change: c.quantityChange,
        absoluteChange: c.absoluteChange
      })),
      topIncreases: changes
        .filter(c => c.changeType === 'INCREASE')
        .slice(0, 5)
        .map(c => ({
          sku: c.sku,
          title: c.title,
          change: c.quantityChange
        })),
      topDecreases: changes
        .filter(c => c.changeType === 'DECREASE')
        .slice(0, 5)
        .map(c => ({
          sku: c.sku,
          title: c.title,
          change: c.quantityChange
        })),
      byCategory: this.summarizeByCategory(changes)
    };
    
    const summaryPath = path.join(this.reportsDir, `summary-${date}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    
    console.log('\n=== DAILY SUMMARY ===');
    console.log(`Date: ${date}`);
    console.log(`Total Products Changed: ${summary.totalProductsChanged}`);
    console.log(`Total Movement: ${summary.totalAbsoluteChange} units`);
    console.log(`Increases: ${summary.increases} | Decreases: ${summary.decreases}`);
    console.log('\nTop 5 Movers:');
    summary.topMovers.slice(0, 5).forEach(p => {
      console.log(`  ${p.sku}: ${p.title.substring(0, 50)}... (${p.change > 0 ? '+' : ''}${p.change})`);
    });
  }

  // Summarize changes by category
  summarizeByCategory(changes) {
    const categories = {};
    
    changes.forEach(c => {
      const cat = c.category1 || 'Uncategorized';
      if (!categories[cat]) {
        categories[cat] = {
          totalChanges: 0,
          absoluteChange: 0,
          increases: 0,
          decreases: 0
        };
      }
      
      categories[cat].totalChanges++;
      categories[cat].absoluteChange += c.absoluteChange;
      if (c.changeType === 'INCREASE') {
        categories[cat].increases++;
      } else {
        categories[cat].decreases++;
      }
    });
    
    return categories;
  }

  // Generate weekly trend report
  async generateWeeklyReport() {
    const reports = [];
    const today = new Date();
    
    // Collect last 7 days of data
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const summaryPath = path.join(this.reportsDir, `summary-${dateStr}.json`);
      
      if (fs.existsSync(summaryPath)) {
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        reports.push(summary);
      }
    }
    
    if (reports.length === 0) {
      console.log('No data available for weekly report');
      return;
    }
    
    // Aggregate weekly trends
    const weeklyTrends = this.aggregateTrends(reports);
    const weeklyPath = path.join(this.reportsDir, `weekly-trends-${today.toISOString().split('T')[0]}.json`);
    fs.writeFileSync(weeklyPath, JSON.stringify(weeklyTrends, null, 2));
    
    console.log('\n=== WEEKLY TRENDS ===');
    console.log(`Period: Last ${reports.length} days`);
    console.log(`Total Movement: ${weeklyTrends.totalMovement} units`);
    console.log('\nMost Active Products:');
    Object.entries(weeklyTrends.productActivity)
      .sort((a, b) => b[1].totalMovement - a[1].totalMovement)
      .slice(0, 10)
      .forEach(([sku, data]) => {
        console.log(`  ${sku}: ${data.totalMovement} units moved`);
      });
  }

  // Aggregate trend data
  aggregateTrends(reports) {
    const productActivity = {};
    let totalMovement = 0;
    
    reports.forEach(report => {
      totalMovement += report.totalAbsoluteChange || 0;
      
      // Track top movers
      if (report.topMovers) {
        report.topMovers.forEach(mover => {
          if (!productActivity[mover.sku]) {
            productActivity[mover.sku] = {
              sku: mover.sku,
              title: mover.title,
              totalMovement: 0,
              appearances: 0
            };
          }
          productActivity[mover.sku].totalMovement += mover.absoluteChange;
          productActivity[mover.sku].appearances++;
        });
      }
    });
    
    return {
      period: `${reports.length} days`,
      totalMovement,
      productActivity,
      avgDailyMovement: totalMovement / reports.length
    };
  }
}

// Export the class
module.exports = InventoryTracker;

// CLI usage
if (require.main === module) {
  const tracker = new InventoryTracker();
  
  // Get the latest export file
  const exportsDir = path.join(__dirname, '../../exports');
  const files = fs.readdirSync(exportsDir)
    .filter(f => f.startsWith('flxpoint-export-'))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    console.log('No export files found');
    process.exit(1);
  }
  
  const latestExport = path.join(exportsDir, files[0]);
  console.log(`Processing: ${files[0]}`);
  
  tracker.processDailyExport(latestExport)
    .then(changes => {
      console.log(`\nProcessed ${changes.length} changes`);
      
      // Generate weekly report if requested
      if (process.argv[2] === '--weekly') {
        return tracker.generateWeeklyReport();
      }
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}