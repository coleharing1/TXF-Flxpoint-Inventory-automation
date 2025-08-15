New Plan Overview (Markdown)
Objectives
Build a robust, DB-first pipeline for daily CSV exports that:
Ingests a single snapshot per day from exports/
Computes day-over-day deltas and aggregates weekly/monthly metrics
Keeps the dashboard fast (sub-2s) and resilient to format drift
Preserves insights you track manually (absolute units/$, category/top movers)
Eliminate brittle code paths, duplication, and client-side heavy work
Current State (condensed)
Server: Node + Express + SQLite; Socket.io
Data: inventory_snapshots_v2, daily_changes, inventory_current
Frontend: AG Grid (v34, infinite row model), Chart.js analytics
APIs: /api/inventory/paginated, /api/inventory/stats, /api/analytics/:period
Export files: One snapshot per day in exports/
Recent fixes: robust filter handling, sort payload, AG Grid theme, analytics crash guard, tests passing
Target Architecture
Immediate Priority (before automation)
- One-time ingestion of the 3 existing daily exports in `exports/` to make the dashboard correct and current first:
  - 2025-08-08: `Original-export-8-8-25.csv`
  - 2025-08-09: `flxpoint-export-2025-08-09T07-08-52.csv`
  - 2025-08-11: `flxpoint-export-2025-08-11T19-59-23.csv`
- Steps (one-time):
  - Parse date from filename, ingest snapshot rows into `inventory_snapshots_v2`
  - Compute deltas vs previous snapshot into `daily_changes`
  - Refresh `inventory_current` with latest snapshot
  - Compute `metrics_daily` for each ingested date
  - Verify dashboard grid and analytics reflect accurate, current data
  - Parity-check totals (abs units/$) with manual sheet where applicable
Data flow (per-day)
Daily CSV (e.g., flxpoint-export-YYYY-MM-DDTHH-MM-SS.csv) → ingest → snapshot rows in inventory_snapshots_v2 (date-scoped) → compute deltas vs previous snapshot → refresh inventory_current → write daily metrics → notify/log
Ingestion
Parse/validate columns: Master SKU (required), Quantity (required), Title/UPC/Category/Estimated Cost (optional)
Normalize numbers ($, commas), skip empty SKUs, log missing UPC/cost coverage
Upsert product attributes into products
Insert snapshot rows into inventory_snapshots_v2(date, sku, quantity, estimated_cost, source, ingested_at)
Change computation
For snapshot date D, find the previous snapshot date P; compute per-SKU deltas (old_quantity, new_quantity, quantity_change, absolute_change, percent_change, value_change) into daily_changes(D)
Aggregated metrics
metrics_daily(date, total_products, total_value, out_of_stock, low_stock, increases, decreases, net_change_units, total_abs_change_units, total_abs_change_usd, generated_at)
Build weekly/monthly analytics from metrics_daily and daily_changes (no client aggregation)
APIs
Inventory: /api/inventory/paginated (unchanged contract); /api/inventory/stats reads metrics_daily (latest)
Analytics: /api/analytics/{daily|weekly|monthly} returns series + breakdowns
Health: /health reports DB status, latest snapshot date, counts
Frontend
AG Grid infinite row model with backend sort/filter
Stats bar reads /api/inventory/stats
Analytics uses /api/analytics/*; guard empty states; add Data Quality panel (missing UPC %, cost %, last snapshot date)
Scheduler/ops
Launchd job: Playwright export → ingest → compute deltas → refresh inventory_current → compute metrics → log/notify
Logs: exports.log, ingest.log, analytics.log; retention/purge for exports
Quality gates
Validate required columns; abort ingest if columns drift (e.g., UPC-first issue)
Keep exactly one canonical export per day (archive extras)
Never drop tables on server start; perform schema checks only
Performance/SLAs
Dashboard initial load < 2s; /api/inventory/paginated p95 < 300ms
Ingestion end-to-end < 2 min for ~2.7MB CSV
Analytics endpoints p95 < 250ms
Rollout Strategy
- Phase 0: One-time ingestion of the 3 existing exports to get dashboard correct now
- Phase 1: DB migrations + ingestion script + metrics daily
- Phase 2: API updates and health checks
- Phase 3: Frontend data quality card; finalize analytics wiring
- Phase 4: Scheduler integration + notifications
- Phase 5: Optional historical backfill and runbooks
