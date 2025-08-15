const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const csv = require('csv-parser');

// Open database connection
const db = new sqlite3.Database('./inventory.db');

async function updateInventoryDirectly() {
    console.log('🔄 Updating inventory_current directly from export file...');
    
    const exportFile = 'exports/flxpoint-export-2025-08-11T19-59-23.csv';
    
    if (!fs.existsSync(exportFile)) {
        console.error('❌ Export file not found:', exportFile);
        return;
    }
    
    console.log('📁 Reading export file:', exportFile);
    
    let updatedCount = 0;
    let notFoundCount = 0;
    
    return new Promise((resolve, reject) => {
        const stmt = db.prepare('UPDATE inventory_current SET quantity = ?, estimated_cost = ?, last_updated = ? WHERE sku = ?');
        
        fs.createReadStream(exportFile)
            .pipe(csv())
            .on('data', (row) => {
                const sku = row['Master SKU'];
                const quantity = parseInt(row['Quantity']) || 0;
                const estimatedCost = parseFloat(row['Estimated Cost']) || 0;
                
                if (sku && sku.trim() !== '') {
                    stmt.run(quantity, estimatedCost, '2025-08-11', sku, function(err) {
                        if (err) {
                            console.error(`Error updating SKU ${sku}:`, err);
                        } else if (this.changes > 0) {
                            updatedCount++;
                        } else {
                            notFoundCount++;
                        }
                    });
                }
            })
            .on('end', () => {
                stmt.finalize();
                
                setTimeout(() => {
                    console.log(`📊 Update complete: ${updatedCount} updated, ${notFoundCount} not found`);
                    
                    // Verify the update
                    db.get("SELECT COUNT(*) as nonzero FROM inventory_current WHERE quantity > 0", (err, row) => {
                        if (err) {
                            console.error('❌ Error verifying update:', err);
                            reject(err);
                            return;
                        }
                        
                        console.log(`✅ Products with quantity > 0: ${row.nonzero}`);
                        console.log('🎉 Direct inventory update completed!');
                        resolve();
                    });
                }, 1000); // Wait for all updates to complete
            })
            .on('error', reject);
    });
}

// Run the update
updateInventoryDirectly()
    .then(() => {
        console.log('✅ Update completed! Dashboard should now show current inventory data.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Update failed:', error);
        process.exit(1);
    });
