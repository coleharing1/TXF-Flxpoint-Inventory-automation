const sqlite3 = require('sqlite3').verbose();

// Open database connection
const db = new sqlite3.Database('./inventory.db');

async function syncInventoryCurrent() {
    console.log('🔄 Syncing inventory_current table with latest snapshot data...');
    
    return new Promise((resolve, reject) => {
        // Update inventory_current with the latest snapshot data from 2025-08-11
        const updateQuery = `
            UPDATE inventory_current 
            SET 
                quantity = (
                    SELECT quantity 
                    FROM inventory_snapshots_v2 
                    WHERE inventory_snapshots_v2.sku = inventory_current.sku 
                    AND inventory_snapshots_v2.date = '2025-08-11'
                ),
                estimated_cost = (
                    SELECT estimated_cost 
                    FROM inventory_snapshots_v2 
                    WHERE inventory_snapshots_v2.sku = inventory_current.sku 
                    AND inventory_snapshots_v2.date = '2025-08-11'
                ),
                last_updated = '2025-08-11'
            WHERE EXISTS (
                SELECT 1 
                FROM inventory_snapshots_v2 
                WHERE inventory_snapshots_v2.sku = inventory_current.sku 
                AND inventory_snapshots_v2.date = '2025-08-11'
            )
        `;
        
        db.run(updateQuery, function(err) {
            if (err) {
                console.error('❌ Error updating inventory_current:', err);
                reject(err);
                return;
            }
            
            console.log(`✅ Updated ${this.changes} records in inventory_current`);
            
            // Verify the update worked
            db.get("SELECT COUNT(*) as nonzero FROM inventory_current WHERE quantity > 0", (err, row) => {
                if (err) {
                    console.error('❌ Error verifying update:', err);
                    reject(err);
                    return;
                }
                
                console.log(`📊 Products with quantity > 0: ${row.nonzero}`);
                console.log('🎉 Inventory sync completed successfully!');
                resolve();
            });
        });
    });
}

// Run the sync
syncInventoryCurrent()
    .then(() => {
        console.log('✅ Sync completed! Dashboard should now show updated data.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    });
