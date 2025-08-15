Detailed Implementation Checklist

Phase 0 — One-time ingestion of existing exports (get dashboard correct now)
[ ] Ingest 2025-08-08: Original-export-8-8-25.csv into inventory_snapshots_v2
[ ] Ingest 2025-08-09: flxpoint-export-2025-08-09T07-08-52.csv into inventory_snapshots_v2
[ ] Ingest 2025-08-11: flxpoint-export-2025-08-11T19-59-23.csv into inventory_snapshots_v2
[ ] Compute deltas for 2025-08-09 vs 2025-08-08 into daily_changes
[ ] Compute deltas for 2025-08-11 vs 2025-08-09 into daily_changes
[ ] Refresh inventory_current from latest snapshot (2025-08-11) joining products
[ ] Compute metrics_daily for each ingested date (08-08, 08-09, 08-11)
[ ] Verify /api/inventory/stats and analytics reflect current data
[ ] Parity-check abs units/$ vs manual where applicable; fix discrepancies

Already completed (validated)
[x] Fix frontend data contract to use data.data in inventory.js
[x] Add robust filter parsing (ignore non-JSON) in pagination API
[x] Add server-side logging of query/filter parameters
[x] Switch to AG Grid v34 infinite row model; fix sort payload keys { colId, sort }
[x] Resolve AG Grid theming conflict by setting theme: 'legacy'
[x] Guard Chart.js context.parsed to prevent analytics crash
[x] Start servers on 4000 (manual) and 3000 (tests); test suite 12/12 pass
Phase 1 — Database + Ingestion
Schema and indexes
[ ] Create metrics_daily table with columns listed above
[ ] Add/confirm indexes:
inventory_snapshots_v2(date, sku), daily_changes(date), daily_changes(absolute_change), inventory_current(sku,title,quantity)
Inventory_current lifecycle
[ ] Remove drop/recreate in api/inventory-paginated.js “initializeViews”
[ ] Implement refreshInventoryCurrent(latestDate):
Upsert latest snapshot rows into inventory_current joined with products
No full rebuild on server start
Ingestion script
[ ] Add scripts/ingest-daily-export.js:
Read latest file in exports/ (parse date from filename; fallback mtime)
Validate columns; coerce numbers; skip empty SKUs; log coverage stats
Upsert products
Insert snapshot rows into inventory_snapshots_v2
Compute deltas vs previous snapshot into daily_changes
Call refreshInventoryCurrent(latestDate)
Compute and write metrics_daily
Log summary to ingest.log
[ ] Unit tests for ingestion (header drift, number coercion, missing fields)
Phase 2 — API Layer
[ ] /api/inventory/stats returns latest metrics_daily
[ ] /api/analytics/{daily|weekly|monthly}:
daily: series from metrics_daily + category/top movers from daily_changes
weekly/monthly: group over metrics_daily and daily_changes
[ ] /api/health: db connectivity, latest snapshot date, row counts, last ingest duration
[ ] Remove any duplicate processing logic (manual export route should trigger the ingestion script only)
Phase 3 — Frontend
Inventory grid
[ ] Confirm infinite model + params.successCallback(data, lastRow) behavior for v34 (already aligned)
[ ] Map advanced search operators to server filters consistently
Stats + analytics
[ ] Ensure stats bar uses /api/inventory/stats only (no client recompute)
[ ] Ensure analytics reads /api/analytics/* and handles empty datasets gracefully
Data Quality panel
[ ] Add a small card: latest snapshot date; % missing UPC; % missing cost; last ingest summary
Phase 4 — Scheduler & Ops
[ ] Launchd job (plist):
Run Playwright export → run node scripts/ingest-daily-export.js
Environment: PATH, working directory, log file path
[ ] Logs and rotation:
exports.log, ingest.log, analytics.log, server.log with rotation policy
[ ] Export retention:
[ ] Keep one canonical export per day; archive or delete duplicates
[ ] Optional: gzip exports older than N days
Phase 5 — Backfill & Parity
[ ] Ingest existing exports in date order:
Original-export-8-8-25.csv, flxpoint-export-2025-08-09T07-08-52.csv, flxpoint-export-2025-08-11T19-59-23.csv
[ ] Parity checks:
Match “Total Abs Change (units/$)” against independent DB calculations
Verify top movers, category breakdown across the three dates
[ ] Performance checks:
/api/inventory/paginated p95 < 300ms
Dashboard load < 2s cold
Ingestion for 2.7MB file < 2 min end-to-end
Phase 6 — Notifications (optional but recommended)
[ ] Email/webhook on:
Failed export/ingest
Unusual movement (threshold of abs change units/$)
Column drift detected
Phase 7 — Docs & Runbooks
[ ] Add docs/Ingestion-Pipeline.md (schema, invariants, CLI usage)
[ ] Update README.md, TECHNICAL_ARCHITECTURE.md with new data flow
[ ] Add docs/Runbook-Daily-Job.md (launchd job ops, logs, recovery steps)
Acceptance Criteria
[ ] Ingest any single-date daily CSV from exports/ and see:
Snapshot rows in inventory_snapshots_v2
Day-over-day deltas in daily_changes
inventory_current refreshed without server restarts
metrics_daily populated and reported by /api/inventory/stats
[ ] Dashboard grid/analytics render quickly with accurate metrics
[ ] Health endpoint green; logs rotated; one export per day retained
[ ] Parity with manual totals (abs units/$) within rounding
Notes specific to your exports folder
Snapshot order for backfill/testing:
2025-08-08: Original-export-8-8-25.csv
2025-08-09: flxpoint-export-2025-08-09T07-08-52.csv
2025-08-11: flxpoint-export-2025-08-11T19-59-23.csv
Use filename date where possible; use file mtime fallback when needed
Optional future enhancements
Historical replays from a directory
Real-time deltas (intra-day) if the source allows
Metric anomaly detection and trend alerts
What changed from prior plan
Explicitly tailored for single-date-per-file exports (no pivoting)
Removes table drops on server start; introduces incremental refresh
Introduces metrics_daily to eliminate client aggregation
Adds ingest script and retention policy integrated with launchd
Quick next steps (execute in order)
[ ] Add DB migration for metrics_daily and indexes
[ ] Implement scripts/ingest-daily-export.js and delta computation
[ ] Replace server start table drop with schema check + refreshInventoryCurrent
[ ] Wire /api/inventory/stats to metrics_daily and add /api/health
[ ] Create Data Quality card on dashboard
[ ] Configure launchd to run export → ingest → metrics daily
Summary
This plan automates your manual tracking with a resilient, incremental pipeline that preserves your insights (daily/weekly/monthly movement, abs units/$, top movers) while making the system faster, safer, and simpler to operate.