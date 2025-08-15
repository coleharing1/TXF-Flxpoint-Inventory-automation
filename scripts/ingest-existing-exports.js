/**
 * @fileoverview One-time ingestion of existing daily exports in the exports/ folder.
 * Ingests snapshots for specific dates, computes day-over-day deltas, refreshes
 * inventory_current for the latest date, and generates metrics_daily for each date.
 *
 * Usage: node scripts/ingest-existing-exports.js
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const sqlite3 = require('sqlite3').verbose();

const PROJECT_ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(PROJECT_ROOT, 'inventory.db');
const EXPORTS_DIR = path.join(PROJECT_ROOT, 'exports');

/**
 * @description Open a SQLite database connection.
 */
function openDb() {
  return new sqlite3.Database(DB_PATH);
}

/**
 * @description Ensure required tables exist (non-destructive), including metrics_daily.
 * Avoid dropping existing tables.
 */
async function ensureSchema(db) {
  await run(db, `CREATE TABLE IF NOT EXISTS metrics_daily (
    date TEXT PRIMARY KEY,
    total_products INTEGER DEFAULT 0,
    total_value REAL DEFAULT 0,
    out_of_stock INTEGER DEFAULT 0,
    low_stock INTEGER DEFAULT 0,
    increases INTEGER DEFAULT 0,
    decreases INTEGER DEFAULT 0,
    net_change_units INTEGER DEFAULT 0,
    total_abs_change_units INTEGER DEFAULT 0,
    total_abs_change_usd REAL DEFAULT 0,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS products (
    sku TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    upc TEXT,
    category1 TEXT,
    category2 TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS inventory_snapshots_v2 (
    date TEXT NOT NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    estimated_cost REAL DEFAULT 0,
    PRIMARY KEY (date, sku)
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS daily_changes (
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
}

/**
 * @description Promisified db.run
 */
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

/**
 * @description Promisified db.get
 */
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

/**
 * @description Promisified db.all
 */
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

/**
 * @description Parse a date string from known export filenames.
 * Examples:
 *  - flxpoint-export-2025-08-09T07-08-52.csv => 2025-08-09
 *  - Original-export-8-8-25.csv => 2025-08-08
 */
function deriveDateFromFilename(filename) {
  const isoMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const shortMatch = filename.match(/(\d{1,2})-(\d{1,2})-(\d{2})/); // M-D-YY
  if (shortMatch) {
    const m = shortMatch[1].padStart(2, '0');
    const d = shortMatch[2].padStart(2, '0');
    const yy = shortMatch[3];
    const yyyy = Number(yy) < 70 ? `20${yy}` : `19${yy}`; // assume 20xx
    return `${yyyy}-${m}-${d}`;
  }
  // fallback to file mtime
  return null;
}

/**
 * @description Upsert product attributes from a CSV row into products.
 */
async function upsertProduct(db, row) {
  const sku = (row['Master SKU'] || '').trim();
  if (!sku) return;
  const title = (row['Title'] || '').trim() || 'Unknown';
  const upc = (row['UPC'] || '').trim() || null;
  const category1 = (row['Category 1'] || '').trim() || null;
  const category2 = (row['Category 2'] || '').trim() || null;

  await run(
    db,
    `INSERT INTO products (sku, title, upc, category1, category2)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(sku) DO UPDATE SET
       title=excluded.title,
       upc=COALESCE(excluded.upc, products.upc),
       category1=COALESCE(excluded.category1, products.category1),
       category2=COALESCE(excluded.category2, products.category2),
       updated_at=CURRENT_TIMESTAMP`,
    [sku, title, upc, category1, category2]
  );
}

/**
 * @description Ingest a single export CSV as a snapshot for a given date.
 */
async function ingestSnapshot(db, filePath, date) {
  console.log(`📥 Ingesting snapshot for ${date} from ${filePath}`);
  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });

  await run(db, 'BEGIN TRANSACTION');
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO inventory_snapshots_v2 (date, sku, quantity, estimated_cost) VALUES (?, ?, ?, ?)'
  );
  let saved = 0;
  let skipped = 0;
  try {
    for (const row of rows) {
      const sku = (row['Master SKU'] || '').trim();
      if (!sku) {
        skipped++;
        continue;
      }
      await upsertProduct(db, row);
      const qtyRaw = (row['Quantity'] || '').toString().replace(/,/g, '').trim();
      const costRaw = (row['Estimated Cost'] || '').toString().replace(/[$,]/g, '').trim();
      const quantity = qtyRaw === '' ? 0 : Number.parseInt(Number.parseFloat(qtyRaw));
      const estimatedCost = costRaw === '' ? 0 : Number.parseFloat(costRaw);
      stmt.run(date, sku, Number.isFinite(quantity) ? quantity : 0, Number.isFinite(estimatedCost) ? estimatedCost : 0);
      saved++;
    }
    stmt.finalize();
    await run(db, 'COMMIT');
    console.log(`💾 Snapshot saved for ${date}. Saved=${saved}, Skipped=${skipped}`);
  } catch (e) {
    stmt.finalize();
    await run(db, 'ROLLBACK');
    throw e;
  }
}

/**
 * @description Compute day-over-day deltas for date vs previousDate and insert into daily_changes.
 */
async function computeDeltas(db, date, previousDate) {
  if (!previousDate) {
    console.log(`ℹ️ No previous snapshot for ${date}. Skipping deltas.`);
    return;
  }
  console.log(`🧮 Computing deltas: ${date} vs ${previousDate}`);

  // Join snapshots; use 0 when missing
  const rows = await all(
    db,
    `SELECT coalesce(p.sku, c.sku) as sku
           , coalesce(c.quantity, 0) as yesterday_qty
           , coalesce(n.quantity, 0) as today_qty
           , coalesce(n.estimated_cost, coalesce(c.estimated_cost, 0)) as estimated_cost
           , pr.title, pr.upc, pr.category1, pr.category2
     FROM (SELECT * FROM inventory_snapshots_v2 WHERE date = ?) c
     FULL OUTER JOIN (SELECT * FROM inventory_snapshots_v2 WHERE date = ?) n ON n.sku = c.sku
     LEFT JOIN products pr ON pr.sku = coalesce(n.sku, c.sku)
     LEFT JOIN (SELECT sku FROM inventory_snapshots_v2 WHERE date = ?) p ON 1=0`,
    [previousDate, date, previousDate]
  ).catch(async () => {
    // SQLite doesn't support FULL OUTER JOIN; emulate with UNION
    return all(
      db,
      `SELECT s.sku,
              COALESCE(prev.quantity, 0) AS yesterday_qty,
              COALESCE(cur.quantity, 0) AS today_qty,
              COALESCE(cur.estimated_cost, COALESCE(prev.estimated_cost, 0)) AS estimated_cost,
              pr.title, pr.upc, pr.category1, pr.category2
       FROM (
         SELECT sku FROM inventory_snapshots_v2 WHERE date = ?
         UNION
         SELECT sku FROM inventory_snapshots_v2 WHERE date = ?
       ) s
       LEFT JOIN inventory_snapshots_v2 prev ON prev.date = ? AND prev.sku = s.sku
       LEFT JOIN inventory_snapshots_v2 cur  ON cur.date  = ? AND cur.sku  = s.sku
       LEFT JOIN products pr ON pr.sku = s.sku`,
      [previousDate, date, previousDate, date]
    );
  });

  await run(db, 'BEGIN TRANSACTION');
  const insert = db.prepare(`INSERT INTO daily_changes (
      date, sku, title, upc, category1, category2,
      yesterday_qty, today_qty, quantity_change, absolute_change, percent_change, change_type,
      estimated_cost, total_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  let count = 0;
  for (const r of rows) {
    const oldQ = Number(r.yesterday_qty) || 0;
    const newQ = Number(r.today_qty) || 0;
    const change = newQ - oldQ;
    const absChange = Math.abs(change);
    if (absChange === 0) continue; // store only changes
    const percent = oldQ === 0 ? 'N/A' : ((change / oldQ) * 100).toFixed(2) + '%';
    const changeType = change > 0 ? 'increase' : 'decrease';
    const estCost = Number(r.estimated_cost) || 0;
    const totalValue = newQ * estCost;
    insert.run(
      date,
      r.sku,
      r.title || '',
      r.upc || '',
      r.category1 || '',
      r.category2 || '',
      oldQ,
      newQ,
      change,
      absChange,
      percent,
      changeType,
      estCost,
      totalValue
    );
    count++;
  }
  insert.finalize();
  await run(db, 'COMMIT');
  console.log(`✅ Deltas computed for ${date}. Rows: ${count}`);
}

/**
 * @description Refresh inventory_current from latest date snapshot (delete + insert).
 */
async function refreshInventoryCurrent(db, latestDate) {
  console.log(`🔄 Refreshing inventory_current for ${latestDate}`);
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS inventory_current (
      sku TEXT PRIMARY KEY,
      title TEXT,
      upc TEXT,
      category1 TEXT,
      category2 TEXT,
      quantity INTEGER,
      estimated_cost REAL,
      quantity_change INTEGER,
      absolute_change INTEGER,
      percent_change TEXT,
      last_updated TEXT
    )`
  );
  await run(db, 'DELETE FROM inventory_current');
  await run(
    db,
    `INSERT INTO inventory_current (
      sku, title, upc, category1, category2,
      quantity, estimated_cost, quantity_change, absolute_change, percent_change, last_updated
    )
    SELECT s.sku, p.title, p.upc, p.category1, p.category2,
           s.quantity, s.estimated_cost, 0, 0, 'N/A', s.date
    FROM inventory_snapshots_v2 s
    LEFT JOIN products p ON p.sku = s.sku
    WHERE s.date = ?`,
    [latestDate]
  );
  console.log('✅ inventory_current refreshed.');
}

/**
 * @description Compute metrics_daily for a specific date.
 */
async function computeMetricsDaily(db, date) {
  const totals = await get(
    db,
    `SELECT COUNT(*) as total_products,
            SUM(quantity * COALESCE(estimated_cost,0)) as total_value,
            SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as out_of_stock,
            SUM(CASE WHEN quantity > 0 AND quantity <= 5 THEN 1 ELSE 0 END) as low_stock
     FROM inventory_snapshots_v2
     WHERE date = ?`,
    [date]
  );

  const changes = await get(
    db,
    `SELECT COALESCE(SUM(CASE WHEN quantity_change > 0 THEN 1 ELSE 0 END),0) as increases,
            COALESCE(SUM(CASE WHEN quantity_change < 0 THEN 1 ELSE 0 END),0) as decreases,
            COALESCE(SUM(quantity_change),0) as net_change_units,
            COALESCE(SUM(absolute_change),0) as total_abs_change_units,
            COALESCE(SUM(absolute_change * COALESCE(estimated_cost,0)),0) as total_abs_change_usd
     FROM daily_changes
     WHERE date = ?`,
    [date]
  );

  await run(
    db,
    `INSERT INTO metrics_daily (
        date, total_products, total_value, out_of_stock, low_stock,
        increases, decreases, net_change_units, total_abs_change_units, total_abs_change_usd, generated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(date) DO UPDATE SET
       total_products=excluded.total_products,
       total_value=excluded.total_value,
       out_of_stock=excluded.out_of_stock,
       low_stock=excluded.low_stock,
       increases=excluded.increases,
       decreases=excluded.decreases,
       net_change_units=excluded.net_change_units,
       total_abs_change_units=excluded.total_abs_change_units,
       total_abs_change_usd=excluded.total_abs_change_usd,
       generated_at=CURRENT_TIMESTAMP`,
    [
      date,
      totals.total_products || 0,
      totals.total_value || 0,
      totals.out_of_stock || 0,
      totals.low_stock || 0,
      changes.increases || 0,
      changes.decreases || 0,
      changes.net_change_units || 0,
      changes.total_abs_change_units || 0,
      changes.total_abs_change_usd || 0,
    ]
  );
  console.log(`📈 metrics_daily updated for ${date}`);
}

/**
 * @description Main orchestrator: ingest 3 exports, compute deltas, refresh current, compute metrics.
 */
async function main() {
  const db = openDb();
  try {
    await ensureSchema(db);

    const files = [
      'Original-export-8-8-25.csv',
      'flxpoint-export-2025-08-09T07-08-52.csv',
      'flxpoint-export-2025-08-11T19-59-23.csv',
    ];

    // Resolve to absolute paths and derive dates
    const tasks = files.map((f) => {
      const fp = path.join(EXPORTS_DIR, f);
      let date = deriveDateFromFilename(f);
      if (!date) {
        const st = fs.statSync(fp);
        const iso = new Date(st.mtime).toISOString().slice(0, 10);
        date = iso;
      }
      return { file: fp, date };
    });

    // Sort by date ascending
    tasks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // Clean existing for idempotency
    for (const t of tasks) {
      await run(db, 'DELETE FROM inventory_snapshots_v2 WHERE date = ?', [t.date]);
      await run(db, 'DELETE FROM daily_changes WHERE date = ?', [t.date]);
      await run(db, 'DELETE FROM metrics_daily WHERE date = ?', [t.date]);
    }

    // Ingest snapshots
    for (const t of tasks) {
      if (!fs.existsSync(t.file)) throw new Error(`File not found: ${t.file}`);
      await ingestSnapshot(db, t.file, t.date);
    }

    // Compute deltas for pairs
    for (let i = 1; i < tasks.length; i++) {
      await computeDeltas(db, tasks[i].date, tasks[i - 1].date);
    }

    // Refresh inventory_current for latest date
    const latestDate = tasks[tasks.length - 1].date;
    await refreshInventoryCurrent(db, latestDate);

    // Compute metrics for each date
    for (const t of tasks) {
      await computeMetricsDaily(db, t.date);
    }

    console.log('🎉 Ingestion complete. Dashboard should now reflect accurate, current data.');
  } catch (e) {
    console.error('❌ Ingestion failed:', e);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();


