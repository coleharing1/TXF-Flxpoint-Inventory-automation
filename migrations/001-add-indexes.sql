-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_date 
ON inventory_snapshots(date);

CREATE INDEX IF NOT EXISTS idx_daily_changes_date 
ON daily_changes(date);

CREATE INDEX IF NOT EXISTS idx_daily_changes_sku 
ON daily_changes(sku);

CREATE INDEX IF NOT EXISTS idx_daily_changes_date_sku 
ON daily_changes(date, sku);

CREATE INDEX IF NOT EXISTS idx_daily_changes_absolute_change 
ON daily_changes(absolute_change DESC);

CREATE INDEX IF NOT EXISTS idx_export_logs_timestamp 
ON export_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_export_logs_status 
ON export_logs(status);

CREATE INDEX IF NOT EXISTS idx_notifications_timestamp 
ON notifications(timestamp DESC);

-- Add constraints for data integrity
CREATE TABLE IF NOT EXISTS products (
    sku TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    upc TEXT,
    category1 TEXT,
    category2 TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create improved inventory snapshots table
CREATE TABLE IF NOT EXISTS inventory_snapshots_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    estimated_cost REAL DEFAULT 0,
    total_value REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sku) REFERENCES products(sku),
    UNIQUE(date, sku)
);

-- Create view for current inventory
CREATE VIEW IF NOT EXISTS current_inventory AS
SELECT 
    s.sku,
    p.title,
    p.upc,
    p.category1,
    p.category2,
    s.quantity,
    s.estimated_cost,
    s.total_value,
    s.date as last_updated
FROM inventory_snapshots_v2 s
JOIN products p ON s.sku = p.sku
WHERE s.date = (
    SELECT MAX(date) 
    FROM inventory_snapshots_v2
);

-- Create view for inventory trends
CREATE VIEW IF NOT EXISTS inventory_trends AS
SELECT 
    date,
    COUNT(DISTINCT sku) as unique_skus,
    SUM(quantity) as total_quantity,
    SUM(total_value) as total_value,
    AVG(quantity) as avg_quantity,
    MAX(quantity) as max_quantity,
    MIN(quantity) as min_quantity
FROM inventory_snapshots_v2
GROUP BY date
ORDER BY date DESC;

-- Add triggers for updated_at
CREATE TRIGGER IF NOT EXISTS update_products_timestamp 
AFTER UPDATE ON products
BEGIN
    UPDATE products SET updated_at = CURRENT_TIMESTAMP 
    WHERE sku = NEW.sku;
END;