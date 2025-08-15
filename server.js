const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises;
const { Server } = require('socket.io');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const { exec } = require('child_process');
const InventoryTracker = require('./src/database/inventory-tracker');
const config = require('./src/config');
const getInventoryStats = require('./src/utils/getInventoryStats');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Import routes
const inventoryRoutes = require('./routes/inventory.routes');
app.use('/api/inventory', inventoryRoutes);

// Initialize SQLite database
const db = new sqlite3.Database(config.database.dbPath);

// Create database tables
db.serialize(() => {
  // Inventory snapshots table
  db.run(`CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE,
    data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // New, structured snapshots table
  db.run(`CREATE TABLE IF NOT EXISTS inventory_snapshots_v2 (
      date TEXT,
      sku TEXT,
      quantity INTEGER,
      estimated_cost REAL,
      PRIMARY KEY (date, sku)
  )`);

  // Daily changes table
  db.run(`CREATE TABLE IF NOT EXISTS daily_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    sku TEXT,
    title TEXT,
    upc TEXT,
    category1 TEXT,
    category2 TEXT,
    yesterday_qty INTEGER,
    today_qty INTEGER,
    quantity_change INTEGER,
    absolute_change INTEGER,
    percent_change TEXT,
    change_type TEXT,
    estimated_cost REAL,
    total_value REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Export logs table
  db.run(`CREATE TABLE IF NOT EXISTS export_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT,
    type TEXT,
    message TEXT,
    error TEXT,
    duration INTEGER,
    file_path TEXT
  )`);

  // Notifications table
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT,
    channel TEXT,
    recipient TEXT,
    message TEXT,
    status TEXT
  )`);

  // Settings table
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// WebSocket connection for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// API Routes

app.get('/api/inventory/stats', async (req, res) => {
    try {
        const stats = await getInventoryStats(db);
        res.json(stats);
    } catch (error) {
        console.error('Error fetching inventory stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// DEPRECATED: This endpoint loads the entire dataset into memory.
// Use the paginated endpoint instead.
/*
app.get('/api/inventory/current', async (req, res) => {
  try {
    const { sort, filter, limit = 1000, offset = 0 } = req.query;
    
    // Get latest snapshot
    const latestSnapshot = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM inventory_snapshots ORDER BY date DESC LIMIT 1',
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!latestSnapshot) {
      return res.json({ data: [], total: 0 });
    }

    const inventoryData = JSON.parse(latestSnapshot.data);
    let items = Object.values(inventoryData);

    // Apply filtering
    if (filter) {
      const filterObj = JSON.parse(filter);
      items = items.filter(item => {
        return Object.entries(filterObj).every(([key, value]) => {
          if (!value) return true;
          return String(item[key]).toLowerCase().includes(String(value).toLowerCase());
        });
      });
    }

    // Apply sorting
    if (sort) {
      const sortObj = JSON.parse(sort);
      items.sort((a, b) => {
        const aVal = a[sortObj.field];
        const bVal = b[sortObj.field];
        const multiplier = sortObj.order === 'asc' ? 1 : -1;
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return (aVal - bVal) * multiplier;
        }
        return String(aVal).localeCompare(String(bVal)) * multiplier;
      });
    }

    const total = items.length;
    
    // Parse limit and offset as integers
    const limitInt = parseInt(limit) || 1000;
    const offsetInt = parseInt(offset) || 0;
    
    const paginatedItems = items.slice(offsetInt, offsetInt + limitInt);

    res.json({
      data: paginatedItems,
      total,
      date: latestSnapshot.date
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: error.message });
  }
});
*/

// Get daily changes - with or without date
app.get('/api/changes/daily', async (req, res) => {
  try {
    const date = new Date().toISOString().split('T')[0];
    
    const changes = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM daily_changes WHERE date = ? ORDER BY absolute_change DESC',
        [date],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    res.json(changes);
  } catch (error) {
    console.error('Error fetching daily changes:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/changes/daily/:date', async (req, res) => {
  try {
    const date = req.params.date;
    
    const changes = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM daily_changes WHERE date = ? ORDER BY absolute_change DESC',
        [date],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    res.json(changes);
  } catch (error) {
    console.error('Error fetching daily changes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get weekly changes
app.get('/api/changes/weekly', async (req, res) => {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    const changes = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM daily_changes 
         WHERE date BETWEEN ? AND ?
         ORDER BY absolute_change DESC`,
        [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    res.json(changes);
  } catch (error) {
    console.error('Error fetching weekly changes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get analytics
app.get('/api/analytics', async (req, res) => {
  try {
    const { period = 'weekly' } = req.query;
    let startDate = new Date();
    const endDate = new Date();
    
    if (period === 'daily') {
      startDate.setDate(startDate.getDate() - 1);
    } else if (period === 'weekly') {
      startDate.setDate(startDate.getDate() - 7);
    } else {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    // Get daily trends
    const dailyTrends = await new Promise((resolve, reject) => {
      db.all(
        `SELECT date, COUNT(*) as changes_count, 
         SUM(absolute_change) as total_movement
         FROM daily_changes 
         WHERE date BETWEEN ? AND ?
         GROUP BY date
         ORDER BY date`,
        [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // Get top movers
    const topMovers = await new Promise((resolve, reject) => {
      db.all(
        `SELECT sku, title, SUM(absolute_change) as total_movement,
         COUNT(*) as change_frequency
         FROM daily_changes 
         WHERE date BETWEEN ? AND ?
         GROUP BY sku
         ORDER BY total_movement DESC
         LIMIT 10`,
        [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // Get category breakdown
    const categoryBreakdown = await new Promise((resolve, reject) => {
      db.all(
        `SELECT category1, COUNT(*) as changes_count,
         SUM(absolute_change) as total_movement
         FROM daily_changes 
         WHERE date BETWEEN ? AND ? AND category1 IS NOT NULL AND category1 != ''
         GROUP BY category1
         ORDER BY total_movement DESC`,
        [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    res.json({
      period,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      dailyTrends,
      topMovers,
      categoryBreakdown
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get analytics data
app.get('/api/analytics/:period', async (req, res) => {
  try {
    const { period } = req.params; // daily, weekly, monthly
    const endDate = new Date();
    let startDate = new Date();
    
    switch (period) {
      case 'daily':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case 'weekly':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case 'monthly':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
    }

    const analytics = await new Promise((resolve, reject) => {
      db.all(
        `SELECT 
          date,
          COUNT(DISTINCT sku) as products_changed,
          SUM(absolute_change) as total_movement,
          SUM(CASE WHEN change_type = 'INCREASE' THEN 1 ELSE 0 END) as increases,
          SUM(CASE WHEN change_type = 'DECREASE' THEN 1 ELSE 0 END) as decreases,
          AVG(absolute_change) as avg_movement
        FROM daily_changes 
        WHERE date >= ? AND date <= ?
        GROUP BY date
        ORDER BY date`,
        [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // Get top movers for the period
    const topMovers = await new Promise((resolve, reject) => {
      db.all(
        `SELECT 
          sku,
          title,
          SUM(absolute_change) as total_movement,
          COUNT(*) as change_frequency
        FROM daily_changes 
        WHERE date >= ? AND date <= ?
        GROUP BY sku
        ORDER BY total_movement DESC
        LIMIT 10`,
        [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // Get category breakdown
    const categoryBreakdown = await new Promise((resolve, reject) => {
      db.all(
        `SELECT 
          category1,
          COUNT(DISTINCT sku) as products,
          SUM(absolute_change) as total_movement,
          AVG(absolute_change) as avg_movement
        FROM daily_changes 
        WHERE date >= ? AND date <= ?
        GROUP BY category1
        ORDER BY total_movement DESC`,
        [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    res.json({
      period,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      dailyTrends: analytics,
      topMovers,
      categoryBreakdown
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get export logs
app.get('/api/exports/logs', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const logs = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM export_logs ORDER BY timestamp DESC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    res.json(logs);
  } catch (error) {
    console.error('Error fetching export logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Run manual export
app.post('/api/exports/run', async (req, res) => {
  try {
    const { type = 'full' } = req.body; // full, export-only, process-only
    
    // Log the start
    const startTime = Date.now();
    await logExport('started', type, `Manual ${type} export initiated`);
    
    // Send immediate response
    res.json({ message: 'Export started', type });
    
    // Emit WebSocket event
    io.emit('export:started', { type, timestamp: new Date() });
    
    // Run the appropriate script
    let command;
    switch (type) {
        case 'export-only':
            command = 'node src/automation/flxpoint-export.js';
            break;
        case 'process-only':
            command = 'node src/database/inventory-tracker.js';
            break;
        default:
            command = 'node src/automation/daily-inventory-run.js';
    }

    exec(command, { cwd: path.join(__dirname) }, async (error, stdout, stderr) => {
      const duration = Date.now() - startTime;
      
      if (error) {
        await logExport('failed', type, 'Export failed', error.message, duration);
        io.emit('export:failed', { type, error: error.message, duration });
      } else {
        await logExport('success', type, 'Export completed successfully', null, duration);
        io.emit('export:completed', { type, duration, output: stdout });
        
        // Let the daily-run script handle processing. This function is no longer needed here.
        // await processLatestExport();
      }
    });
  } catch (error) {
    console.error('Error running export:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get/Update settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM settings', (err, rows) => {
        if (err) reject(err);
        else {
          const settingsObj = {};
          rows.forEach(row => {
            settingsObj[row.key] = row.value;
          });
          resolve(settingsObj);
        }
      });
    });
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    
    for (const [key, value] of Object.entries(settings)) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          [key, value],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    res.json({ message: 'Settings updated' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test notification
app.post('/api/notifications/test', async (req, res) => {
  try {
    const { channel, recipient, message } = req.body;
    
    await sendNotification(channel, recipient, message);
    
    res.json({ message: 'Test notification sent' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions

async function logExport(status, type, message, error = null, duration = null) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO export_logs (status, type, message, error, duration) VALUES (?, ?, ?, ?, ?)',
      [status, type, message, error, duration],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/* DEPRECATED: This logic is now handled by the daily-inventory-run.js script.
async function processLatestExport() {
  try {
    const tracker = new InventoryTracker();
    const exportsDir = path.join(__dirname, 'exports');
    const files = await fs.readdir(exportsDir);
    const latestFile = files
      .filter(f => f.startsWith('flxpoint-export-'))
      .sort()
      .reverse()[0];
    
    if (latestFile) {
      const changes = await tracker.processDailyExport(path.join(exportsDir, latestFile));
      
      // Store changes in database
      const date = new Date().toISOString().split('T')[0];
      
      for (const change of changes) {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT OR REPLACE INTO daily_changes 
            (date, sku, title, upc, category1, category2, yesterday_qty, today_qty, 
             quantity_change, absolute_change, percent_change, change_type, 
             estimated_cost, total_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              date, change.sku, change.title, change.upc, change.category1, 
              change.category2, change.yesterdayQty, change.todayQty,
              change.quantityChange, change.absoluteChange, change.percentChange,
              change.changeType, change.estimatedCost, change.totalValue
            ],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
      
      // Store snapshot
      const snapshotPath = path.join(__dirname, 'inventory-data', `snapshot-${date}.json`);
      if (await fs.access(snapshotPath).then(() => true).catch(() => false)) {
        const snapshotData = await fs.readFile(snapshotPath, 'utf8');
        
        await new Promise((resolve, reject) => {
          db.run(
            'INSERT OR REPLACE INTO inventory_snapshots (date, data) VALUES (?, ?)',
            [date, snapshotData],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
    }
  } catch (error) {
    console.error('Error processing export:', error);
  }
}
*/

async function sendNotification(channel, recipient, message) {
  try {
    // Log notification attempt
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO notifications (type, channel, recipient, message, status) VALUES (?, ?, ?, ?, ?)',
        ['manual', channel, recipient, message, 'pending'],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    switch (channel) {
      case 'email':
        // Implement email notification
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
        
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: recipient,
          subject: 'TXF Inventory Alert',
          text: message
        });
        break;
        
      case 'webhook':
        // Implement webhook notification
        const axios = require('axios');
        await axios.post(recipient, { message });
        break;
        
      default:
        console.log(`Notification: ${message}`);
    }
    
    // Update notification status
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE notifications SET status = ? WHERE id = ?',
        ['sent', this.lastID],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
}

// Schedule daily export (if not already scheduled via launchctl)
// cron.schedule('0 6 * * *', async () => {
//   console.log('Running scheduled daily export...');
//   exec('node daily-inventory-run.js', async (error, stdout, stderr) => {
//     if (error) {
//       await logExport('failed', 'scheduled', 'Scheduled export failed', error.message);
//     } else {
//       await logExport('success', 'scheduled', 'Scheduled export completed');
//       await processLatestExport();
//     }
//   });
// });

// Start server
const PORT = config.server.server.port;
server.listen(PORT, () => {
  console.log(`TXF Inventory Tracker server running on http://localhost:${PORT}`);
  console.log('Dashboard: http://localhost:' + PORT);
});

module.exports = { app, io, db };