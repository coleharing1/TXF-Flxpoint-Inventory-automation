#!/bin/bash

# TXF Automation Quick Setup Script
# Implements practical improvements without over-engineering

echo "🚀 TXF Automation Quick Setup"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Check environment
echo -e "${YELLOW}1. Checking environment...${NC}"
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file - please update with your credentials${NC}"
else
    echo -e "${GREEN}✓ .env file exists${NC}"
fi

# 2. Run database optimizations
echo -e "\n${YELLOW}2. Optimizing database...${NC}"
if [ -f db/migrate.js ]; then
    node db/migrate.js
    echo -e "${GREEN}✓ Database indexes added${NC}"
else
    echo "Migration file not found, skipping..."
fi

# 3. Clean up old data
echo -e "\n${YELLOW}3. Cleaning up old files...${NC}"
if [ -f utils/cleanup.js ]; then
    node utils/cleanup.js
    echo -e "${GREEN}✓ Old files cleaned${NC}"
else
    echo "Cleanup script not found, skipping..."
fi

# 4. Run health check
echo -e "\n${YELLOW}4. Running system health check...${NC}"
if [ -f monitor.js ]; then
    node monitor.js
else
    echo "Monitor not found, skipping..."
fi

# 5. Test API endpoints
echo -e "\n${YELLOW}5. Testing API endpoints...${NC}"
curl -s http://localhost:3000/api/inventory/current?limit=1 > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ API is responding${NC}"
    
    # Get stats
    TOTAL=$(curl -s http://localhost:3000/api/inventory/current?limit=1 | jq '.total')
    echo "  Total products: $TOTAL"
    
    CHANGES=$(curl -s http://localhost:3000/api/changes/daily/$(date +%Y-%m-%d) | jq 'length')
    echo "  Today's changes: $CHANGES"
else
    echo -e "⚠️  Server not running. Start with: npm start"
fi

# 6. Set up daily monitoring (optional)
echo -e "\n${YELLOW}6. Daily monitoring setup${NC}"
echo "Would you like to set up daily health checks? (y/n)"
read -r response
if [[ "$response" == "y" ]]; then
    # Add to crontab
    (crontab -l 2>/dev/null; echo "0 8 * * * cd $(pwd) && node monitor.js --scheduled >> logs/monitor.log 2>&1") | crontab -
    echo -e "${GREEN}✓ Daily health check scheduled for 8:00 AM${NC}"
fi

# 7. Display quick commands
echo -e "\n${YELLOW}📝 Quick Commands:${NC}"
echo ""
echo "  Start server:        npm start"
echo "  Run health check:    node monitor.js"
echo "  Manual export:       node flxpoint-export.js"
echo "  Process data:        node inventory-tracker.js"
echo "  Clean old files:     node utils/cleanup.js"
echo "  View dashboard:      open http://localhost:3000"
echo ""

# 8. Performance tips
echo -e "${YELLOW}⚡ Performance Tips:${NC}"
echo ""
echo "1. Dashboard loads 112k products - use filters!"
echo "2. Export runs take ~15 minutes - be patient"
echo "3. Check monitor.js output daily for issues"
echo "4. Keep exports/ folder under 1GB"
echo "5. Restart server after major data updates"
echo ""

echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Update .env with your FLXPoint credentials"
echo "2. Run 'npm start' to start the server"
echo "3. Visit http://localhost:3000"
echo ""