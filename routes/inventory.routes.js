const express = require('express');
const router = express.Router();
const InventoryAPI = require('../api/inventory-paginated');
const path = require('path');
const { logger } = require('../utils/logger');
const getInventoryStats = require('../src/utils/getInventoryStats');

// Initialize inventory API
const inventoryAPI = new InventoryAPI(path.join(__dirname, '..', 'inventory.db'));

// Current inventory endpoint - used by enhanced inventory dashboard
router.get('/current', async (req, res) => {
    try {
        const { limit = 200000, offset = 0 } = req.query;
        
        const totalQuery = await inventoryAPI.getOne(
            'SELECT COUNT(*) as total FROM inventory_current'
        );
        
        const data = await inventoryAPI.getAll(
            `SELECT * FROM inventory_current 
             ORDER BY sku 
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        
        res.json({
            data,
            total: totalQuery.total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        logger.error('Error fetching current inventory', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch inventory data' });
    }
});

// Paginated inventory endpoint
router.get('/paginated', async (req, res) => {
    try {
        const startTime = Date.now();
        
        // Debug logging
        console.log('📥 Paginated request query params:', req.query);
        console.log('🔍 Filter parameter specifically:', req.query.filter);
        
        const [result, stats] = await Promise.all([
            inventoryAPI.getPaginatedInventory({
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 100,
                sort: req.query.sort,
                filter: req.query.filter,
                search: req.query.search
            }),
            getInventoryStats(inventoryAPI.db)
        ]);
        
        const duration = Date.now() - startTime;
        
        // Log slow queries
        if (duration > 1000) {
            logger.warn('Slow inventory query', { duration, params: req.query });
        }
        
        res.json({ ...result, stats });
    } catch (error) {
        logger.error('Error fetching paginated inventory', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch inventory data' });
    }
});

// Refresh materialized view
router.post('/refresh-view', async (req, res) => {
    try {
        await inventoryAPI.refreshMaterializedView();
        res.json({ message: 'Inventory view refreshed successfully' });
    } catch (error) {
        logger.error('Error refreshing inventory view', { error: error.message });
        res.status(500).json({ error: 'Failed to refresh inventory view' });
    }
});

// Search endpoint with autocomplete
router.get('/search', async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;
        
        if (!q || q.length < 2) {
            return res.json({ results: [] });
        }
        
        const results = await inventoryAPI.getAll(
            `SELECT sku, title, quantity, category1 
             FROM inventory_current 
             WHERE sku LIKE ? OR title LIKE ? 
             LIMIT ?`,
            [`${q}%`, `%${q}%`, limit]
        );
        
        res.json({ results });
    } catch (error) {
        logger.error('Error searching inventory', { error: error.message });
        res.status(500).json({ error: 'Search failed' });
    }
});

// Top movers endpoint
router.get('/top-movers', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        const movers = await inventoryAPI.getAll(
            `SELECT sku, title, quantity, quantity_change, absolute_change, percent_change
             FROM inventory_current
             WHERE absolute_change > 0
             ORDER BY absolute_change DESC
             LIMIT ?`,
            [limit]
        );
        
        res.json({ movers });
    } catch (error) {
        logger.error('Error fetching top movers', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch top movers' });
    }
});

// Low stock alert endpoint
router.get('/low-stock', async (req, res) => {
    try {
        const { threshold = 10 } = req.query;
        
        const lowStock = await inventoryAPI.getAll(
            `SELECT sku, title, quantity, category1, estimated_cost
             FROM inventory_current
             WHERE quantity > 0 AND quantity <= ?
             ORDER BY quantity ASC`,
            [threshold]
        );
        
        res.json({ 
            items: lowStock,
            count: lowStock.length,
            threshold 
        });
    } catch (error) {
        logger.error('Error fetching low stock items', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch low stock items' });
    }
});

module.exports = router;