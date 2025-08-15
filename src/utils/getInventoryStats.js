const getInventoryStats = async (db) => {
    const totalProducts = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM products', (err, row) => err ? reject(err) : resolve(row.count));
    });
    const totalValue = await new Promise((resolve, reject) => {
        db.get('SELECT SUM(quantity * estimated_cost) as value FROM inventory_current', (err, row) => err ? reject(err) : resolve(row.value));
    });
    const outOfStock = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM inventory_current WHERE quantity = 0', (err, row) => err ? reject(err) : resolve(row.count));
    });
    const lowStock = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM inventory_current WHERE quantity > 0 AND quantity <= 20', (err, row) => err ? reject(err) : resolve(row.count));
    });
    const changedToday = await new Promise((resolve, reject) => {
        const today = new Date().toISOString().split('T')[0];
        db.get("SELECT COUNT(*) as count FROM daily_changes WHERE date = ?", [today], (err, row) => err ? reject(err) : resolve(row.count));
    });

    return {
        totalProducts,
        totalValue,
        outOfStock,
        lowStock,
        changedToday,
        avgValue: totalValue / totalProducts
    };
};

module.exports = getInventoryStats;
