const fs = require('fs').promises;
const csv = require('csv-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { createReadStream } = require('fs');

async function importChanges() {
  const db = new sqlite3.Database('./inventory.db');
  
  const changesFile = path.join(__dirname, 'reports', 'daily-changes-2025-08-09.csv');
  console.log('Importing changes from:', changesFile);
  
  // Read the changes CSV
  const changes = [];
  
  await new Promise((resolve, reject) => {
    createReadStream(changesFile)
      .pipe(csv())
      .on('data', (row) => {
        changes.push({
          date: '2025-08-09',
          sku: row['SKU'],
          title: row['Title'],
          upc: row['UPC'] || '',
          category1: row['Category 1'] || '',
          category2: row['Category 2'] || '',
          yesterdayQty: parseInt(row['Yesterday Qty'] || '0'),
          todayQty: parseInt(row['Today Qty'] || '0'),
          quantityChange: parseInt(row['Quantity Change'] || '0'),
          absoluteChange: parseInt(row['Absolute Change'] || '0'),
          percentChange: row['Percent Change'] || 'N/A',
          changeType: row['Change Type'] || 'NO_CHANGE',
          estimatedCost: parseFloat(row['Estimated Cost'] || '0'),
          totalValue: parseFloat(row['Total Value'] || '0')
        });
      })
      .on('end', () => {
        console.log(`Parsed ${changes.length} changes`);
        resolve();
      })
      .on('error', reject);
  });
  
  // Insert changes into database
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO daily_changes 
        (date, sku, title, upc, category1, category2, yesterday_qty, today_qty,
         quantity_change, absolute_change, percent_change, change_type,
         estimated_cost, total_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      changes.forEach(change => {
        stmt.run(
          change.date,
          change.sku,
          change.title,
          change.upc,
          change.category1,
          change.category2,
          change.yesterdayQty,
          change.todayQty,
          change.quantityChange,
          change.absoluteChange,
          change.percentChange,
          change.changeType,
          change.estimatedCost,
          change.totalValue,
          (err) => {
            if (err) console.error('Error inserting change:', err);
          }
        );
      });
      
      stmt.finalize(() => {
        console.log('✅ Changes imported successfully');
        db.close((err) => {
          if (err) console.error('Error closing database:', err);
          resolve();
        });
      });
    });
  });
}

// Run import
importChanges()
  .then(() => {
    console.log('Import completed!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });