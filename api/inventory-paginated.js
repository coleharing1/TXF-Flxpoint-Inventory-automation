const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class InventoryAPI {
    constructor(dbPath) {
        this.db = new sqlite3.Database(dbPath);
        this.initializeViews();
    }

    async initializeViews() {
        // Drop the old view if it exists
        await this.runQuery(`DROP TABLE IF EXISTS inventory_current`);
        
        // Create materialized view for better performance
        await this.runQuery(`
            CREATE TABLE IF NOT EXISTS inventory_current AS
            SELECT 
                p.sku,
                p.title,
                p.upc,
                p.category1,
                p.category2,
                COALESCE(s.quantity, 0) as quantity,
                COALESCE(s.estimated_cost, 0) as estimated_cost,
                COALESCE(c.quantity_change, 0) as quantity_change,
                COALESCE(c.absolute_change, 0) as absolute_change,
                COALESCE(c.percent_change, 'N/A') as percent_change,
                COALESCE(s.date, date('now')) as last_updated
            FROM products p
            LEFT JOIN (
                SELECT * FROM inventory_snapshots_v2 
                WHERE date = (SELECT MAX(date) FROM inventory_snapshots_v2)
            ) s ON p.sku = s.sku
            LEFT JOIN (
                SELECT * FROM daily_changes 
                WHERE date = date('now')
            ) c ON p.sku = c.sku
        `);

        // Create indexes for fast queries
        await this.runQuery(`CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory_current(sku)`);
        await this.runQuery(`CREATE INDEX IF NOT EXISTS idx_inventory_title ON inventory_current(title)`);
        await this.runQuery(`CREATE INDEX IF NOT EXISTS idx_inventory_quantity ON inventory_current(quantity)`);
    }

    async getPaginatedInventory(options = {}) {
        const {
            page = 1,
            limit = 100,
            sort = null,
            filter = null,
            search = null
        } = options;

        const offset = (page - 1) * limit;
        
        // Build base query
        let query = 'SELECT * FROM inventory_current WHERE 1=1';
        let countQuery = 'SELECT COUNT(*) as total FROM inventory_current WHERE 1=1';
        const params = [];

        // Add search filter
        if (search && search.length > 0) {
            const searchPattern = `%${search}%`;
            query += ` AND (sku LIKE ? OR title LIKE ? OR upc LIKE ?)`;
            countQuery += ` AND (sku LIKE ? OR title LIKE ? OR upc LIKE ?)`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        // Add column filters
        if (filter && filter.trim() !== '') {
            console.log('Received filter parameter:', filter, 'Type:', typeof filter);
            let filters = {};
            
            // Only try to parse if it looks like JSON (starts with { or [)
            if (filter.trim().startsWith('{') || filter.trim().startsWith('[')) {
                try {
                    filters = JSON.parse(filter);
                    console.log('Parsed filters successfully:', filters);
                } catch (e) {
                    console.error('Invalid filter JSON:', filter, 'Error:', e.message);
                    filters = {};
                }
            } else {
                console.warn('Ignoring non-JSON filter parameter:', filter);
                filters = {};
            }
            Object.entries(filters).forEach(([column, filterDef]) => {
                if (filterDef.type === 'contains' && filterDef.filter) {
                    query += ` AND ${column} LIKE ?`;
                    countQuery += ` AND ${column} LIKE ?`;
                    params.push(`%${filterDef.filter}%`);
                } else if (filterDef.type === 'equals') {
                    query += ` AND ${column} = ?`;
                    countQuery += ` AND ${column} = ?`;
                    params.push(filterDef.filter);
                } else if (filterDef.type === 'greaterThan') {
                    query += ` AND ${column} > ?`;
                    countQuery += ` AND ${column} > ?`;
                    params.push(filterDef.filter);
                }
            });
        }

        // Get total count first
        const totalResult = await this.getOne(countQuery, params);
        const total = totalResult.total;

        // Add sorting
        if (sort) {
            const sortObj = JSON.parse(sort);
            const direction = sortObj.sort === 'asc' ? 'ASC' : 'DESC';
            query += ` ORDER BY ${sortObj.colId} ${direction}`;
        } else {
            query += ' ORDER BY sku ASC';
        }

        // Add pagination
        query += ` LIMIT ${limit} OFFSET ${offset}`;

        // Execute query
        const data = await this.getAll(query, params);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    async refreshMaterializedView() {
        // Refresh the materialized view with latest data
        await this.runQuery('DROP TABLE IF EXISTS inventory_current');
        await this.initializeViews();
    }

    // Helper methods
    runQuery(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ changes: this.changes, lastID: this.lastID });
            });
        });
    }

    getAll(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    getOne(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = InventoryAPI;