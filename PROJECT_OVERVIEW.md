<!-- @fileoverview High-level project overview for TXF Inventory Tracker - an automated inventory movement tracking system with real-time analytics and intelligent export automation. -->

## TXF Inventory Tracker — Automated Inventory Movement Analytics

### Purpose

Automate daily inventory exports from FLXPoint and track product movement by measuring day‑over‑day changes in distributor‑reported quantity (QTY) across 112,841 products. The system provides real-time analytics, intelligent export automation, and a professional web dashboard for comprehensive inventory management.

### Data sources

- **Master reference file**: `Original-export-8-8-25.csv`
  - Contains: SKU, Product Name, UPC, Categories, Pricing
  - Serves as the canonical mapping for SKU → product details
  - Imported into structured database tables for optimal performance
- **Automated daily exports**: Generated via Playwright automation
  - SKU (Master SKU column)
  - QTY (distributor available quantity) 
  - Estimated cost
  - Automated download with integrity validation
  - Intelligent polling (2-20 minutes) for export completion

### Core workflow

1. **Automated Export**: Playwright automation runs at 6:00 AM daily
   - Login to FLXPoint with persistent authentication
   - Navigate to Products section with robust selectors
   - Select all products and configure export columns
   - Poll for completion (intelligent wait: 2-20 minutes)
   - Download and validate CSV file
2. **Data Processing**: Process downloaded export with validation
   - Parse CSV with SKU constraint validation
   - Match to master product data on SKU
   - Store in structured database tables (`inventory_snapshots_v2`)
3. **Change Calculation**: Calculate daily movements
   - `absolute_movement = |today_qty − yesterday_qty|`
   - Track percentage changes and movement patterns
   - Update `daily_changes` table with comprehensive metrics
4. **Real-time Updates**: Push changes to dashboard
   - WebSocket notifications to connected clients
   - Update analytics and visualizations
   - Generate reports and insights

### Business context and constraints

- QTY reflects distributor inventory, not just our own sales; other sellers affect the same pool.
- QTY can decrease (sales) or increase (restock). We track the **absolute** daily change to capture movement in either direction.
- Goal: understand which SKUs are most popular/active based on inventory movement signals.

### Key definitions

- **SKU**: Unique product identifier used for joins across files.
- **QTY**: Distributor‑reported available quantity at snapshot time.
- **Estimated cost**: Distributor cost estimate associated with the SKU for the day’s snapshot.

### System Outputs

- **Real-time Dashboard**: Professional web interface with AG-Grid
  - Server-side pagination for optimal performance (112,841 products)
  - Advanced filtering, sorting, and search capabilities
  - Live inventory statistics and movement indicators
- **Analytics Platform**: Comprehensive charts and insights
  - Daily movement trends and category breakdowns
  - Top movers identification and pattern analysis
  - Historical data visualization and forecasting
- **Automated Reports**: Generated daily reports and summaries
  - CSV exports with movement data and product context
  - JSON summaries for API integration
  - Email notifications for critical changes (configurable)
- **API Endpoints**: RESTful interface for external integrations
  - Real-time inventory data access
  - Historical movement queries
  - Analytics data for third-party tools


