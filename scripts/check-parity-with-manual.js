/**
 * @fileoverview Compares dashboard DB metrics with the manual sheet
 * "Real Example Coles Manual - Sheet1.csv" for dates Aug 8, 9, 11.
 * Prints a parity report with absolute and percent differences.
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const sqlite3 = require('sqlite3').verbose();

const PROJECT_ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(PROJECT_ROOT, 'inventory.db');
const MANUAL_FILE = path.join(PROJECT_ROOT, 'Real Example Coles Manual - Sheet1.csv');

function openDb() { return new sqlite3.Database(DB_PATH); }

function get(db, sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function all(db, sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function readManualMetrics() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(MANUAL_FILE)) {
      return reject(new Error('Manual file not found: ' + MANUAL_FILE));
    }
    let headers=[];
    const sums = { '2025-08-08': 0, '2025-08-09': 0, '2025-08-11': 0 };
    const positives = { '2025-08-08': 0, '2025-08-09': 0, '2025-08-11': 0 };
    let totalAbsUnits = 0;
    let totalAbsUsd = 0;
    fs.createReadStream(MANUAL_FILE)
      .pipe(csv())
      .on('headers', (h) => { headers = h; })
      .on('data', (row) => {
        const map = {
          '2025-08-08': 'Aug 8 Qty',
          '2025-08-09': 'Aug 9 Qty',
          '2025-08-11': 'Aug 11 Qty',
        };
        for (const [date, col] of Object.entries(map)) {
          const v = (row[col] || '').toString().replace(/,/g,'').trim();
          const n = v === '' ? 0 : Number.parseInt(Number.parseFloat(v));
          sums[date] += Number.isFinite(n) ? n : 0;
          if ((Number.isFinite(n) ? n : 0) > 0) positives[date]++;
        }
        const absUnits = (row['Total Abs Change'] || '').toString().replace(/,/g,'').trim();
        const absUsd = (row['Total Abs Change $'] || '').toString().replace(/[$,]/g,'').trim();
        const u = absUnits === '' ? 0 : Number.parseInt(Number.parseFloat(absUnits));
        const usd = absUsd === '' ? 0 : Number.parseFloat(absUsd);
        totalAbsUnits += Number.isFinite(u) ? u : 0;
        totalAbsUsd += Number.isFinite(usd) ? usd : 0;
      })
      .on('end', () => {
        resolve({ headers, sums, positives, totalAbsUnits, totalAbsUsd });
      })
      .on('error', reject);
  });
}

async function readDbMetrics(db) {
  const dates = ['2025-08-08','2025-08-09','2025-08-11'];
  const perDate = {};
  for (const d of dates) {
    const r = await get(db, `SELECT SUM(quantity) as sum_qty,
                                    SUM(CASE WHEN quantity>0 THEN 1 ELSE 0 END) as positive_count
                             FROM inventory_snapshots_v2 WHERE date = ?`, [d]);
    perDate[d] = {
      sum_qty: r?.sum_qty || 0,
      positive_count: r?.positive_count || 0
    };
  }
  const deltas = await all(db, `SELECT date, SUM(absolute_change) as total_abs_change_units
                                FROM daily_changes WHERE date IN ('2025-08-09','2025-08-11')
                                GROUP BY date ORDER BY date`);
  const totalAbsUnits = (deltas || []).reduce((a,b)=> a + (b.total_abs_change_units||0), 0);
  // approximate USD using estimated_cost stored on daily_changes
  const usdRow = await get(db, `SELECT COALESCE(SUM(absolute_change * COALESCE(estimated_cost,0)),0) as total_abs_change_usd
                                FROM daily_changes WHERE date IN ('2025-08-09','2025-08-11')`);
  return { perDate, totalAbsUnits, totalAbsUsd: usdRow?.total_abs_change_usd || 0 };
}

function pctDiff(a, b) {
  if (b === 0) return a === 0 ? 0 : 100;
  return ((a - b) / b) * 100;
}

async function main() {
  const db = openDb();
  try {
    const manual = await readManualMetrics();
    const dbm = await readDbMetrics(db);

    console.log('=== Parity Report ===');
    for (const d of ['2025-08-08','2025-08-09','2025-08-11']) {
      const mSum = manual.sums[d];
      const mPos = manual.positives[d];
      const s = dbm.perDate[d]?.sum_qty || 0;
      const p = dbm.perDate[d]?.positive_count || 0;
      console.log(`Date ${d}:`);
      console.log(`  Sum Qty: DB=${s} vs Manual=${mSum} (diff=${(s-mSum)} | ${(pctDiff(s,mSum)).toFixed(2)}%)`);
      console.log(`  Positive SKUs: DB=${p} vs Manual=${mPos} (diff=${(p-mPos)} | ${(pctDiff(p,mPos)).toFixed(2)}%)`);
    }
    console.log('Totals across change days (08-09 & 08-11):');
    console.log(`  Abs Change Units: DB=${dbm.totalAbsUnits} vs Manual=${manual.totalAbsUnits} (diff=${dbm.totalAbsUnits-manual.totalAbsUnits} | ${(pctDiff(dbm.totalAbsUnits, manual.totalAbsUnits)).toFixed(2)}%)`);
    console.log(`  Abs Change $: DB=${dbm.totalAbsUsd.toFixed(2)} vs Manual=${manual.totalAbsUsd.toFixed(2)} (diff=${(dbm.totalAbsUsd-manual.totalAbsUsd).toFixed(2)} | ${(pctDiff(dbm.totalAbsUsd, manual.totalAbsUsd)).toFixed(2)}%)`);

    // Exit non-zero if any discrepancy > 1%
    const thresholdsExceeded = [
      Math.abs(pctDiff(dbm.perDate['2025-08-08'].sum_qty, manual.sums['2025-08-08'])) > 1,
      Math.abs(pctDiff(dbm.perDate['2025-08-09'].sum_qty, manual.sums['2025-08-09'])) > 1,
      Math.abs(pctDiff(dbm.perDate['2025-08-11'].sum_qty, manual.sums['2025-08-11'])) > 1,
      Math.abs(pctDiff(dbm.totalAbsUnits, manual.totalAbsUnits)) > 1,
    ].some(Boolean);
    if (thresholdsExceeded) process.exitCode = 2;
  } catch (e) {
    console.error('Parity check failed:', e.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();


