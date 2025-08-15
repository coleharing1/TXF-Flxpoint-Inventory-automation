#!/bin/bash

# TXF Inventory Tracker - Daily Schedule Setup Script

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PLIST_NAME="com.txf.inventory"
PLIST_FILE="$SCRIPT_DIR/$PLIST_NAME.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
INSTALLED_PLIST="$LAUNCH_AGENTS_DIR/$PLIST_NAME.plist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================================"
echo "TXF Inventory Tracker - Schedule Setup"
echo "================================================"
echo ""

# Function to display menu
show_menu() {
    echo "What would you like to do?"
    echo ""
    echo "1) Install daily schedule (runs at 6:00 AM)"
    echo "2) Uninstall daily schedule"
    echo "3) Check schedule status"
    echo "4) Run now (test)"
    echo "5) Change schedule time"
    echo "6) View recent logs"
    echo "7) Exit"
    echo ""
    echo -n "Enter your choice [1-7]: "
}

# Function to install schedule
install_schedule() {
    echo -e "${YELLOW}Installing daily schedule...${NC}"
    
    # Create logs directory
    mkdir -p "$SCRIPT_DIR/logs"
    
    # Create LaunchAgents directory if it doesn't exist
    mkdir -p "$LAUNCH_AGENTS_DIR"
    
    # Copy plist file
    cp "$PLIST_FILE" "$INSTALLED_PLIST"
    
    # Load the schedule
    launchctl load "$INSTALLED_PLIST" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Schedule installed successfully!${NC}"
        echo "The inventory tracker will run daily at 6:00 AM"
    else
        # Try unloading first then loading (in case it was already loaded)
        launchctl unload "$INSTALLED_PLIST" 2>/dev/null
        launchctl load "$INSTALLED_PLIST"
        echo -e "${GREEN}✓ Schedule updated successfully!${NC}"
    fi
    
    echo ""
    echo "Note: The task will run even if your computer is asleep,"
    echo "but it will wait until the computer wakes up."
}

# Function to uninstall schedule
uninstall_schedule() {
    echo -e "${YELLOW}Uninstalling daily schedule...${NC}"
    
    if [ -f "$INSTALLED_PLIST" ]; then
        # Unload the schedule
        launchctl unload "$INSTALLED_PLIST" 2>/dev/null
        
        # Remove the plist file
        rm "$INSTALLED_PLIST"
        
        echo -e "${GREEN}✓ Schedule uninstalled successfully!${NC}"
    else
        echo -e "${RED}Schedule is not currently installed.${NC}"
    fi
}

# Function to check status
check_status() {
    echo -e "${YELLOW}Checking schedule status...${NC}"
    echo ""
    
    if [ -f "$INSTALLED_PLIST" ]; then
        echo -e "${GREEN}✓ Schedule is installed${NC}"
        
        # Check if it's loaded
        if launchctl list | grep -q "$PLIST_NAME"; then
            echo -e "${GREEN}✓ Schedule is active${NC}"
            
            # Get status details
            echo ""
            echo "Schedule details:"
            launchctl list | grep "$PLIST_NAME"
        else
            echo -e "${RED}✗ Schedule is not active${NC}"
            echo "Run option 1 to activate it."
        fi
        
        # Show next run time (6:00 AM)
        echo ""
        echo "Scheduled to run daily at: 6:00 AM"
        
        # Check last run from log
        if [ -f "$SCRIPT_DIR/logs/daily-run.log" ]; then
            echo ""
            echo "Last run:"
            tail -n 1 "$SCRIPT_DIR/logs/daily-run.log" | grep "Date:" || echo "No recent runs found"
        fi
    else
        echo -e "${RED}✗ Schedule is not installed${NC}"
        echo "Run option 1 to install it."
    fi
}

# Function to run now
run_now() {
    echo -e "${YELLOW}Running inventory tracker now...${NC}"
    echo "This will take approximately 15-20 minutes."
    echo ""
    
    cd "$SCRIPT_DIR"
    node daily-inventory-run.js
    
    echo ""
    echo -e "${GREEN}✓ Manual run completed!${NC}"
}

# Function to change schedule time
change_time() {
    echo "Current schedule: 6:00 AM"
    echo ""
    echo -n "Enter new hour (0-23): "
    read hour
    echo -n "Enter new minute (0-59): "
    read minute
    
    # Validate input
    if [[ ! "$hour" =~ ^[0-9]+$ ]] || [ "$hour" -lt 0 ] || [ "$hour" -gt 23 ]; then
        echo -e "${RED}Invalid hour. Please enter a number between 0 and 23.${NC}"
        return
    fi
    
    if [[ ! "$minute" =~ ^[0-9]+$ ]] || [ "$minute" -lt 0 ] || [ "$minute" -gt 59 ]; then
        echo -e "${RED}Invalid minute. Please enter a number between 0 and 59.${NC}"
        return
    fi
    
    # Update the plist file
    sed -i '' "/<key>Hour<\/key>/!b;n;s/<integer>.*<\/integer>/<integer>$hour<\/integer>/" "$PLIST_FILE"
    sed -i '' "/<key>Minute<\/key>/!b;n;s/<integer>.*<\/integer>/<integer>$minute<\/integer>/" "$PLIST_FILE"
    
    echo -e "${GREEN}✓ Schedule time updated to $hour:$(printf %02d $minute)${NC}"
    echo ""
    echo "Please reinstall the schedule (option 1) for changes to take effect."
}

# Function to view logs
view_logs() {
    echo -e "${YELLOW}Recent log entries:${NC}"
    echo ""
    
    if [ -f "$SCRIPT_DIR/logs/daily-run.log" ]; then
        echo "=== Last 20 lines of daily-run.log ==="
        tail -n 20 "$SCRIPT_DIR/logs/daily-run.log"
    else
        echo "No logs found yet."
    fi
    
    echo ""
    
    if [ -f "$SCRIPT_DIR/logs/daily-run-error.log" ] && [ -s "$SCRIPT_DIR/logs/daily-run-error.log" ]; then
        echo "=== Recent errors ==="
        tail -n 10 "$SCRIPT_DIR/logs/daily-run-error.log"
    fi
}

# Main menu loop
while true; do
    show_menu
    read choice
    echo ""
    
    case $choice in
        1)
            install_schedule
            ;;
        2)
            uninstall_schedule
            ;;
        3)
            check_status
            ;;
        4)
            run_now
            ;;
        5)
            change_time
            ;;
        6)
            view_logs
            ;;
        7)
            echo "Goodbye!"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option. Please try again.${NC}"
            ;;
    esac
    
    echo ""
    echo "Press Enter to continue..."
    read
    clear
done