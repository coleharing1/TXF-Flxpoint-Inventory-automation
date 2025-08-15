const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// Open database connection
const db = new sqlite3.Database('./inventory.db');

async function processLatestExport() {
    console.log('🔄 Processing latest export file...');
    
    const exportFile = 'exports/flxpoint-export-2025-08-11T19-59-23.csv';
    const date = '2025-08-11';
    
    if (!fs.existsSync(exportFile)) {
        console.error('❌ Export file not found:', exportFile);
        return;
    }
    
    console.log('📁 Reading export file:', exportFile);
    
    const data = {};
    let processedCount = 0;
    
    return new Promise((resolve, reject) => {
        fs.createReadStream(exportFile)
            .pipe(csv())
            .on('data', (row) => {
                const sku = row['Master SKU'];
                if (sku && sku.trim() !== '') {
                    data[sku] = {
                        sku: sku,
                        quantity: parseInt(row['Quantity']) || 0,
                        estimatedCost: parseFloat(row['Estimated Cost']) || 0
                    };
                    processedCount++;
                }
            })
            .on('end', async () => {
                console.log(`📊 Parsed ${processedCount} products from export`);
                
                // Save to database
                console.log('💾 Saving to database...');
                await saveSnapshotToDB(data, date, db);
                
                console.log('✅ Export processing complete!');
                console.log('🔄 Please refresh your dashboard to see updated data');
                resolve();
            })
            .on('error', reject);
    });
}

async function saveSnapshotToDB(data, date, db) {
    const stmt = db.prepare('INSERT OR REPLACE INTO inventory_snapshots_v2 (date, sku, quantity, estimated_cost) VALUES (?, ?, ?, ?)');
    db.run('BEGIN TRANSACTION');

    let savedCount = 0;
    let skippedCount = 0;

    for (const sku in data) {
        const item = data[sku];
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
    console.log(`📈 Snapshot for ${date} saved to database. Saved: ${savedCount}, Skipped: ${skippedCount}`);
}

// Run the processing
processLatestExport()
    .then(() => {
        console.log('🎉 Processing completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Processing failed:', error);
        process.exit(1);
    });
