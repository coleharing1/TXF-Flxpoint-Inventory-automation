const fs = require('fs').promises;
const csv = require('csv-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { createReadStream } = require('fs');

async function importBaseline() {
  const db = new sqlite3.Database('./inventory.db');
  
  console.log('Importing baseline data from Original-export-8-8-25.csv...');
  
  // First, let's read and parse the CSV
  const items = [];
  
  await new Promise((resolve, reject) => {
    createReadStream('Original-export-8-8-25.csv')
      .pipe(csv())
      .on('data', (row) => {
        // Map the fields properly
        const item = {
          sku: row['Master SKU'] || row['SKU'],
          title: row['Title'] || row['Product Title'] || '',
          upc: row['UPC'] || '',
          category1: row['Category 1'] || row['Category'] || '',
          category2: row['Category 2'] || '',
          quantity: parseInt(row['Quantity'] || row['Qty'] || '0'),
          estimatedCost: parseFloat(row['Estimated Cost'] || row['Cost'] || '0')
        };
        
        if (item.sku) {
          items.push(item);
        }
      })
      .on('end', () => {
        console.log(`Parsed ${items.length} items from CSV`);
        resolve();
      })
      .on('error', reject);
  });
  
  // Now insert into database
  const date = '2025-08-08'; // Yesterday's date for baseline
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Begin transaction
      db.run('BEGIN TRANSACTION');
      
      // Insert products first
      const productStmt = db.prepare(`
        INSERT OR REPLACE INTO products (sku, title, upc, category1, category2)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      // Insert inventory snapshots into the new structured table
      const snapshotStmt = db.prepare(`
        INSERT OR REPLACE INTO inventory_snapshots_v2 (date, sku, quantity, estimated_cost)
        VALUES (?, ?, ?, ?)
      `);
      
      let processed = 0;
      items.forEach(item => {
        // Insert into products table
        productStmt.run(
          item.sku,
          item.title,
          item.upc,
          item.category1,
          item.category2
        );

        // Insert into snapshots table
        snapshotStmt.run(
            date,
            item.sku,
            item.quantity,
            item.estimatedCost
        );
        
        processed++;
        if (processed % 1000 === 0) {
          console.log(`Processed ${processed}/${items.length} items...`);
        }
      });
      
      productStmt.finalize();
      snapshotStmt.finalize();
      
      // Commit transaction
      db.run('COMMIT', (err) => {
        if (err) {
          console.error('Error committing transaction:', err);
          db.run('ROLLBACK');
          reject(err);
        } else {
          console.log('✅ Baseline data imported successfully');
          console.log(`Total items: ${items.length}`);
          
          // Close database
          db.close((err) => {
            if (err) console.error('Error closing database:', err);
            resolve();
          });
        }
      });
    });
  });
}

// Run import
importBaseline()
  .then(() => {
    console.log('Import completed!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });