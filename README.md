# 📦 TXF Inventory Tracker

A comprehensive automation and analytics platform for tracking inventory movements across 112,841 products with intelligent export automation, real-time dashboard, and optimized database architecture.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Start the server
npm start

# Open dashboard
open http://localhost:3000
```

## 📁 Project Structure

```
TXF_Automations/
├── src/                      # Source code
│   ├── automation/          # Automation scripts
│   │   ├── flxpoint-export-final.js      # Production export script
│   │   ├── flxpoint-export-working.js    # Reference implementation
│   │   └── daily-inventory-run.js        # Daily orchestrator
│   ├── database/            # Database operations
│   │   ├── inventory-tracker.js
│   │   └── import-baseline.js
│   ├── services/            # Service layer
│   │   └── monitor.js
│   ├── config/             # Configuration files (consolidated)
│   │   ├── constants.js
│   │   ├── database.config.js
│   │   ├── automation.config.js
│   │   └── server.config.js
│   └── utils/              # Utilities
│       ├── getInventoryStats.js
│       └── verifyExport.js
├── public/                  # Frontend assets
│   ├── index.html
│   ├── dashboard.html       # Dashboard interface
│   ├── css/
│   └── js/
├── api/                     # API modules
│   └── inventory-paginated.js
├── routes/                  # Express routes
│   └── inventory.routes.js
├── tests/                   # Test files
│   └── test-system.js
├── scripts/                 # Utility scripts
│   ├── schedule-setup.sh
│   └── quick-setup.sh
├── docs/                    # Documentation
│   ├── README_COMPREHENSIVE.md
│   ├── TECHNICAL_ARCHITECTURE.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── playwright-recorder-full.md  # Working automation reference
│   └── archive/             # Historical documentation
├── auth/                    # Auth state (consolidated)
│   ├── auth.json
│   └── flxpoint-auth.json
├── exports/                 # Export files (gitignored)
├── logs/                    # Application logs (gitignored)
├── reports/                 # Generated reports
├── server.js               # Main server file
├── inventory.db            # SQLite database (optimized)
├── package.json            # Dependencies
└── .env                    # Environment variables
```

## 📝 Available Scripts

```bash
npm start              # Start the production server
npm run dev           # Start development server with nodemon
npm run export        # Run FLXPoint export manually
npm run track         # Process inventory changes
npm run daily         # Run complete daily update
npm test              # Run system tests
npm run import        # Import baseline data
npm run setup:schedule # Set up daily schedule
```

## 🔧 Configuration

### Environment Variables (.env)

```bash
# Server
PORT=3000
HOST=localhost

# FLXPoint Credentials
FLXPOINT_EMAIL=your-email@company.com
FLXPOINT_PASSWORD=your-password

# Export Settings
EXPORT_WAIT_TIME=900000  # 15 minutes
RETRY_ATTEMPTS=3
EXPORT_RETENTION=30       # days

# Debug
DEBUG_MODE=false
VERBOSE=false
HEADLESS=true

# Notifications
NOTIFICATION_EMAIL=admin@company.com
WEBHOOK_URL=https://hooks.slack.com/...
```

## 🌟 Features

- **Intelligent Export Automation**: Playwright-powered daily FLXPoint exports with polling (2-20 min)
- **Optimized Dashboard**: Server-side pagination for 112,841 products with sub-2-second loads
- **Advanced Analytics**: Real-time charts and insights for inventory movements
- **Robust Database**: Structured `inventory_snapshots_v2` with constraint validation
- **RESTful API**: Comprehensive endpoints with server-side filtering and pagination
- **Real-time Updates**: WebSocket live updates across all connected clients
- **Export Validation**: CSV integrity checks and SKU validation
- **Clean Architecture**: 39MB cleanup with consolidated configuration

## 📊 API Endpoints

- `GET /api/inventory/paginated` - Server-side pagination with filtering/sorting
- `GET /api/inventory/stats` - Quick dashboard statistics  
- `GET /api/inventory/search` - Real-time search functionality
- `GET /api/inventory/top-movers` - Movement analytics
- `GET /api/inventory/low-stock` - Stock alerts
- `GET /api/changes/daily/:date` - Daily changes
- `GET /api/changes/weekly` - Weekly summary
- `GET /api/analytics` - Comprehensive analytics
- `GET /api/exports/logs` - Export history with durations
- `POST /api/exports/run` - Trigger manual export
- `GET /api/settings` - Configuration management
- `GET /health` - System health check

## 🧪 Testing

Run the comprehensive test suite:

```bash
npm test
```

This will test:
- Server health
- All API endpoints
- Database operations
- Performance metrics

## 📚 Documentation

Detailed documentation is available in the `docs/` directory:

- [Comprehensive Overview](docs/README_COMPREHENSIVE.md)
- [Technical Architecture](TECHNICAL_ARCHITECTURE.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Optimization Summary](docs/OPTIMIZATION_SUMMARY.md)
- [Playwright Recording Reference](docs/playwright-recorder-full.md)
- [Historical Documentation](docs/archive/) - Archived completed tasks

## 🔒 Security

- Environment variables for sensitive data
- SQL injection prevention
- XSS protection
- Rate limiting on API endpoints
- Session management

## 📈 Performance

- **Products Tracked**: 112,841
- **API Response**: < 5ms average (server-side optimized)
- **Dashboard Load**: < 2 seconds (server-side row model)
- **Export Time**: 2-20 minutes (intelligent polling)
- **Database Size**: 88+ MB (optimized structure)
- **Success Rate**: 99%+ (enhanced reliability)
- **Space Savings**: 39MB freed through cleanup

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `npm test`
4. Submit a pull request

## 📄 License

ISC License

## 🆘 Support

For issues or questions:
- Check `logs/` directory for errors
- Run `npm test` for diagnostics
- Review documentation in `docs/`

---

**Version**: 1.1.0  
**Last Updated**: August 11, 2025  
**System Status**: Production Ready (Optimized)