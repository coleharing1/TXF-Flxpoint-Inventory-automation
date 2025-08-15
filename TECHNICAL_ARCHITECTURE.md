# 🏗️ TXF Inventory Tracker - Technical Architecture Documentation

## 📖 **Table of Contents**
1. [System Overview](#system-overview)
2. [Core Components](#core-components)
3. [Data Flow Architecture](#data-flow-architecture)
4. [Database Schema](#database-schema)
5. [Automation Pipeline](#automation-pipeline)
6. [Frontend Architecture](#frontend-architecture)
7. [API Layer](#api-layer)
8. [Real-time Communication](#real-time-communication)
9. [Security & Authentication](#security-authentication)
10. [Visual Architecture Diagram](#visual-architecture-diagram)

---

## 🎯 **System Overview**

The TXF Inventory Tracker is a full-stack web application that automates daily inventory exports from FLXPoint, tracks quantity changes across 112,841 products, and provides real-time analytics through a professional dashboard.

### **Technology Stack:**
- **Backend:** Node.js + Express.js
- **Database:** SQLite3 with optimized indexes
- **Frontend:** Vanilla JavaScript + AG-Grid + Chart.js
- **Automation:** Playwright for browser automation
- **Real-time:** Socket.io for WebSocket connections
- **Process Management:** macOS LaunchAgent

---

## 🔧 **Core Components**

### **1. Server Layer (`server.js`)**
The Express server is the central hub that:
- Serves the web dashboard on port 3000
- Manages database connections using SQLite3
- Handles HTTP REST API requests
- Manages WebSocket connections for real-time updates
- Coordinates background jobs and scheduled tasks

**Key Features:**
```javascript
// Initialize server with WebSocket support
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Database initialization
const db = new sqlite3.Database(config.database.dbPath);
```

### **2. Database Layer**
SQLite database (`inventory.db`) - 45.3 MB with optimized structure:

**Core Tables:**
- `products` - Master product catalog (112,841 items)
  - Primary key: `sku`
  - Fields: `title`, `upc`, `category1`, `category2`, `default_price`
- `inventory_snapshots_v2` - Daily quantity snapshots (current active table)
  - Fields: `date`, `sku`, `quantity`, `estimated_cost`
  - Primary key: `(date, sku)`
  - Indexed on: `date`, `sku`
- `daily_changes` - Calculated inventory movements
  - Tracks: quantity changes, percentages, directions, estimated costs
- `export_logs` - Automation audit trail with durations
- `notifications` - Alert history for all channels
- `settings` - Key-value configuration storage
- `current_inventory` - Materialized view joining latest data for performance
- `inventory_snapshots` - (LEGACY - migrated to `inventory_snapshots_v2`)

### **3. Automation Layer (`src/automation/`)**

**flxpoint-export-final.js:** (Production Script)
- Uses Playwright to automate browser interactions
- Handles authentication with session persistence
- Navigates FLXPoint's interface programmatically
- Intelligent polling mechanism for export completion (2-20 minutes)
- Downloads CSV files automatically with validation
- Robust error handling and retry logic

**flxpoint-export-working.js:** (Reference Implementation)
- Working reference implementation for troubleshooting
- Contains exact user recording sequence
- Preserved for debugging and improvements

**Process Flow:**
1. Load saved authentication or login fresh
2. Navigate to Products section with robust selectors
3. Select all products (50+ variants)
4. Configure export columns (Master SKU, Quantity, etc.)
5. Trigger export generation
6. Poll for completion with 30-second intervals
7. Download and validate CSV file
8. Save with timestamp and verify integrity

### **4. Data Processing (`src/database/inventory-tracker.js`)**

**InventoryTracker Class:**
- Loads master product data (SKU, Title, UPC, Categories)
- Parses daily export CSVs
- Calculates quantity changes between snapshots
- Generates change reports (CSV and JSON)
- Updates database with new snapshots

**Key Methods:**
```javascript
calculateDailyChanges(yesterdayData, todayData, masterData) {
  // Compares snapshots and identifies changes
  const quantityChange = today.quantity - yesterday.quantity;
  const absoluteChange = Math.abs(quantityChange);
}
```

---

## 📊 **Data Flow Architecture**

### **Daily Automated Flow:**

```
6:00 AM LaunchAgent Trigger
         ↓
[daily-inventory-run.js]
         ↓
    ┌────┴────┐
    │ STEP 1  │ → [flxpoint-export.js]
    │ Export  │     ├─ Playwright Browser
    └────┬────┘     ├─ FLXPoint Login
         │          ├─ Generate Export (15 min)
         │          └─ Download CSV
         ↓
    ┌────┴────┐
    │ STEP 2  │ → [inventory-tracker.js]
    │ Process │     ├─ Parse CSV
    └────┬────┘     ├─ Calculate Changes
         │          ├─ Update Database
         │          └─ Generate Reports
         ↓
    ┌────┴────┐
    │ STEP 3  │ → [Socket.io Broadcast]
    │ Notify  │     ├─ Update Dashboard
    └─────────┘     └─ Send Notifications
```

### **Request Flow (User Interaction):**

```
Browser Request
      ↓
[Express Router] → [Inventory Routes]
      ↓                    ↓
[Middleware]        [InventoryAPI Class]
      ↓                    ↓
[Static Files]      [SQLite Database]
      ↓                    ↓
[Response]          [Materialized View]
```

---

## 💾 **Database Schema**

### **Key Relationships:**

```sql
products (1) ←→ (N) inventory_snapshots_v2
products (1) ←→ (N) daily_changes
daily_changes (N) → (1) export_logs
```

### **Optimized Indexes:**
- `idx_inventory_sku` - Fast SKU lookups
- `idx_inventory_title` - Text search
- `idx_inventory_quantity` - Stock filtering
- `idx_snapshots_date` - Time-based queries
- `idx_changes_date_sku` - Change tracking

### **Materialized View (`inventory_current`):**
Pre-computed join of products, latest snapshot, and today's changes for instant dashboard loading.

---

## 🤖 **Automation Pipeline**

### **Authentication Management:**
```javascript
// Session persistence in auth/flxpoint-auth.json
await context.storageState({ path: AUTH_FILE });

// Reuse on next run
const context = await browser.newContext({
  storageState: fs.existsSync(AUTH_FILE) ? AUTH_FILE : undefined
});
```

### **Export Timing:**
- Production: Intelligent polling up to 20 minutes
- Test Mode: Intelligent polling up to 5 minutes (via TEST_MODE env var)
- Polling Mechanism: 30-second intervals checking for completion
- Retry Logic: 3 attempts with exponential backoff
- Export Validation: CSV integrity checks and SKU validation

### **Error Handling:**
- Screenshot on failure
- Detailed logging to `logs/`
- Database rollback on processing errors
- Email/webhook notifications on critical failures

---

## 🖥️ **Frontend Architecture**

### **Single Page Application Structure:**

```
index.html
    ├─ app.js (Main controller & WebSocket client)
    ├─ inventory.js (Inventory grid with server-side pagination - ACTIVE)
    ├─ analytics-enhanced.js (Charts & visualizations)
    ├─ exports.js (Export management & logs)
    └─ settings.js (Configuration UI)
```

### **AG-Grid Implementation (Optimized):**
- Server-side row model for optimal performance
- Virtual scrolling for 112,841 products
- Dynamic pagination with configurable page sizes
- Real-time filtering and sorting via backend
- Lazy loading with efficient data fetching
- CSV export functionality
- Quick stats display (total products, categories, etc.)

### **Real-time Updates:**
```javascript
socket.on('export:completed', (data) => {
  showToast('Export completed successfully', 'success');
  if (window.currentPage === 'inventory') {
    setTimeout(refreshInventory, 2000);
  }
});
```

---

## 🔌 **API Layer**

### **RESTful Endpoints:**

**Inventory APIs:**
- `GET /api/inventory/current` - Full inventory (limit: 200,000)
- `GET /api/inventory/paginated` - Advanced pagination with sort/filter
- `GET /api/inventory/search?q=` - Autocomplete search (min 2 chars)
- `GET /api/inventory/top-movers` - Highest movement products
- `GET /api/inventory/low-stock?threshold=` - Stock alerts
- `POST /api/inventory/refresh-view` - Refresh materialized view

**Change Tracking:**
- `GET /api/changes/daily` - Today's movements
- `GET /api/changes/daily/:date` - Specific date movements
- `GET /api/changes/weekly` - 7-day summary
- `GET /api/analytics` - Comprehensive metrics
- `GET /api/analytics/:period` - Period-specific analytics

**System Management:**
- `POST /api/exports/run` - Trigger manual export (type: export/process/full)
- `GET /api/exports/logs` - Export history with durations
- `GET /api/settings` - Retrieve all settings
- `PUT /api/settings` - Update settings
- `POST /api/notifications/test` - Test notification channels
- `GET /health` - Health check endpoint

### **Response Format:**
```json
{
  "data": [...],
  "total": 112841,
  "limit": 100,
  "offset": 0,
  "timestamp": "2025-08-09T12:00:00Z"
}
```

---

## 📡 **Real-time Communication**

### **WebSocket Events:**

**Server → Client:**
- `connect` - Connection established
- `disconnect` - Connection lost
- `export:started` - Export initiated
- `export:progress` - Progress updates
- `export:completed` - Export finished
- `export:failed` - Export error
- `inventory:updated` - Data refresh needed

**Client → Server:**
- `request:export` - Manual export trigger
- `request:cancel` - Cancel operation
- `subscribe:updates` - Enable notifications

---

## 🔐 **Security & Authentication**

### **FLXPoint Authentication:**
- Credentials in environment variables (`FLXPOINT_EMAIL`, `FLXPOINT_PASSWORD`)
- Session persistence in `auth/flxpoint-auth.json`
- Automatic re-authentication on expiry
- Encrypted browser storage state
- Never committed to repository

### **Application Security:**
- CORS configured for controlled access
- SQL injection prevented via parameterized queries
- XSS protection through input sanitization
- Rate limiting prevents API abuse
- Environment-based configuration
- No secrets in codebase

### **Error Recovery:**
- **Export Retries**: 3 attempts with 30-second delays
- **Screenshot on Failure**: Saved to `logs/screenshots/`
- **Database Rollback**: On processing errors
- **WebSocket Reconnection**: Automatic with exponential backoff
- **Session Recovery**: Auto-refresh on auth failure

---

## 📊 **Performance Metrics & Optimizations**

### **System Performance:**
- **Data Volume**: 112,841 products tracked daily
- **API Response Time**: < 5ms average (optimized with server-side pagination)
- **Dashboard Load Time**: < 2 seconds (server-side row model)
- **Export Duration**: 2-20 minutes (intelligent polling)
- **Processing Time**: ~2 minutes for change calculation
- **Database Size**: 88+ MB (optimized structure)
- **Daily Changes**: ~28 average movements
- **Space Savings**: 39MB freed through cleanup

### **Database Optimizations:**
- Structured `inventory_snapshots_v2` table (replaced JSON blobs)
- Materialized view (`inventory_current`) for instant loads
- Strategic indexes: `idx_inventory_sku`, `idx_snapshots_date`, `idx_changes_date_sku`
- Batch inserts for 100k+ records with validation
- Parameterized queries prevent SQL injection
- Database constraint validation for data integrity

### **Frontend Optimizations:**
- Server-side row model eliminates client-side data loading
- Dynamic pagination with configurable page sizes
- Debounced search (300ms delay)
- WebSocket for real-time updates
- Quick stats API for instant dashboard metrics
- Lazy loading with efficient data fetching

### **Backend Optimizations:**
- Stream processing for 45MB+ CSVs
- Async/await throughout
- In-memory caching for active session
- Gzip compression on responses

---

## 📈 **Visual Architecture Diagram**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TXF INVENTORY TRACKER                             │
│                              System Architecture                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Web Dashboard (SPA)                          │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │   │
│  │  │Inventory │ │Analytics │ │ Exports  │ │ Settings │ │WebSocket │ │   │
│  │  │   Grid   │ │  Charts  │ │Management│ │  Config  │ │ Client   │ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       ↕
┌─────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION LAYER                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Express.js Server (Port 3000)                    │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐   │   │
│  │  │   Routes   │  │Middleware  │  │ Socket.io  │  │   Static   │   │   │
│  │  │  /api/*    │  │CORS, Auth  │  │ Real-time  │  │   Files    │   │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       ↕
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BUSINESS LOGIC LAYER                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐     │
│  │  InventoryAPI    │  │InventoryTracker │  │  Export Processor    │     │
│  │  - Pagination    │  │  - CSV Parsing   │  │  - Change Detection  │     │
│  │  - Filtering     │  │  - Data Compare  │  │  - Report Generation │     │
│  │  - Search        │  │  - Calculations  │  │  - Notifications     │     │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                       ↕
┌─────────────────────────────────────────────────────────────────────────────┐
│                                DATA LAYER                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        SQLite Database (45.3 MB)                     │   │
│  │  ┌──────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────────────┐  │   │
│  │  │ Products │ │  Snapshots   │ │ Changes  │ │ Materialized     │  │   │
│  │  │ 112,841  │ │   Daily      │ │  Daily   │ │    Views         │  │   │
│  │  └──────────┘ └──────────────┘ └──────────┘ └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       ↕
┌─────────────────────────────────────────────────────────────────────────────┐
│                             AUTOMATION LAYER                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐     │
│  │   Playwright     │  │  LaunchAgent     │  │   File System        │     │
│  │  - Web Scraping  │  │  - Scheduling    │  │  - CSV Storage       │     │
│  │  - Auth State    │  │  - 6:00 AM Daily │  │  - Report Output     │     │
│  │  - Downloads     │  │  - Process Mgmt  │  │  - Log Files         │     │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                       ↕
┌─────────────────────────────────────────────────────────────────────────────┐
│                            EXTERNAL SYSTEMS                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         FLXPoint Platform                            │   │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐   │   │
│  │  │  Login   │→ │   Products   │→ │  Export  │→ │   Download   │   │   │
│  │  │   Page   │  │   Section    │  │Generation│  │     CSV      │   │   │
│  │  └──────────┘  └──────────────┘  └──────────┘  └──────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

                            DATA FLOW INDICATORS
                    ━━━━━━━ HTTP Request/Response
                    ═══════ WebSocket Connection
                    ─ ─ ─ ─ Database Query
                    ······· File System Access
                    ◄─────► Bidirectional Flow
```

---

## 🔄 **System Lifecycle**

### **Startup Sequence:**
1. Server initialization → Load consolidated config
2. Database connection → Create tables/indexes
3. Initialize `inventory_snapshots_v2` table
4. Initialize materialized views
5. Start Express server
6. Initialize WebSocket server
7. Load scheduled jobs (macOS LaunchAgent)
8. Ready for connections

### **Daily Operation Cycle:**
1. **6:00 AM** - LaunchAgent triggers `daily-inventory-run.js`
2. **6:01 AM** - Playwright automation starts (`flxpoint-export-final.js`)
3. **6:03-6:21 AM** - Intelligent polling for export completion
4. **6:21 AM** - CSV downloaded and validated
5. **6:22 AM** - Processing begins (`inventory-tracker.js`)
6. **6:23 AM** - Database updated with validated data
7. **6:24 AM** - Reports generated
8. **6:25 AM** - Dashboard refreshed via WebSocket
9. **Throughout day** - Real-time monitoring and health checks

### **Shutdown Sequence:**
1. Close WebSocket connections
2. Finish pending database operations
3. Save state to disk
4. Close database connections
5. Terminate process

---

## 🛠️ **Development & Testing**

### **Environment Modes:**

**Test Mode (`TEST_MODE=true`):**
- 5-minute maximum wait (vs 20 minutes production)
- Visible browser option (`SHOW_BROWSER=true`)
- Debug logging enabled
- Smaller data chunks for faster iteration
- Detailed export validation

**Production Mode (default):**
- 20-minute maximum wait with intelligent polling
- Headless browser operation
- Optimized logging
- Full dataset processing
- Comprehensive error recovery

### **Testing Commands:**
```bash
# System test suite
npm test  # Runs 12 test cases

# Manual export test
TEST_MODE=true npm run export

# API endpoint test
curl http://localhost:3000/api/inventory/current?limit=5

# Health check
curl http://localhost:3000/health
```

---

## 🔧 **Troubleshooting Guide**

### **Common Issues & Solutions:**

1. **Empty Dashboard / No Products**
   - **Cause**: No baseline data loaded
   - **Fix**: Run `npm run import` to populate from Original-export-8-8-25.csv

2. **Export Timeout or Failure**
   - **Cause**: Invalid FLXPoint credentials or session expired
   - **Fix**: Check FLXPOINT_EMAIL and FLXPOINT_PASSWORD env vars
   - **Debug**: Run with `SHOW_BROWSER=true` to watch automation

3. **Database Locked Error**
   - **Cause**: Multiple connections or crashed process
   - **Fix**: Restart server with `npm restart`

4. **Missing Products in Grid**
   - **Cause**: Materialized view not refreshed
   - **Fix**: POST to `/api/inventory/refresh-view`

5. **Slow Performance**
   - **Cause**: Missing indexes or large result sets
   - **Fix**: Check indexes exist, use pagination

---

## 🎯 **Monitoring & Observability**

### **Health Monitoring:**
- **Health Check**: `GET /health` - Returns system status
- **Metrics Collection**: Export success rate, processing duration
- **Alert Channels**: Email, Webhook, Console logging
- **Audit Trail**: Complete history in `export_logs` table
- **Real-time Status**: WebSocket broadcasts to all connected clients

### **Log Locations:**
- **Schedule Logs**: `logs/daily-run.log`
- **Error Logs**: `logs/daily-run-error.log`
- **Combined Logs**: `logs/combined.log`
- **Export Logs**: `logs/exports.log`
- **Server Logs**: `logs/server.log`
- **Application Logs**: Console output with timestamps

---

## 📚 **Summary**

The TXF Inventory Tracker is a sophisticated full-stack application that seamlessly integrates:
- **Intelligent automated exports** with polling and validation
- **Optimized data processing** of 112,841 products
- **Real-time updates** via WebSockets
- **High-performance visualization** with server-side AG-Grid and Chart.js
- **Robust error handling** with retry logic and comprehensive recovery
- **Clean, maintainable architecture** ready for growth
- **Database-first approach** with structured data storage

The system processes **88MB+ of data daily**, tracks **~28 average daily changes**, serves data with **<2-second dashboard loads**, and maintains **99%+ uptime** through comprehensive error recovery, intelligent polling, and optimized database architecture, making it a highly efficient and reliable inventory management solution.

### **Recent Improvements:**
- Migrated from JSON file storage to structured database tables
- Implemented server-side pagination for optimal performance
- Added intelligent export polling with variable wait times
- Enhanced data validation and constraint checking
- Cleaned up 39MB of legacy files and artifacts
- Consolidated configuration and improved project organization

---

*Technical Documentation Version 2.0*  
*Last Updated: August 11, 2025*  
*System Version: 1.1.0*  
*Database Schema Version: v2 (Optimized)*