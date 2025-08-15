/**
 * @fileoverview WORKING REFERENCE - FLXPoint Export Script
 * 
 * ✅ STATUS: FULLY WORKING - DO NOT MODIFY THIS FILE
 * This script serves as a working reference based on successful Playwright recording.
 * 
 * WHAT'S WORKING:
 * ✅ Authentication and login handling
 * ✅ Navigation to Products page (using robust href selector)
 * ✅ Product selection (all 112k+ variants)
 * ✅ Export column configuration (exact sequence from recording)
 * ✅ Export generation initiation
 * ✅ Polling mechanism (waits up to 20 minutes for completion)
 * ✅ File download (4.89 MB, 112,841 rows)
 * ✅ File verification (size and basic validation)
 * ✅ Proper error handling and logging
 * 
 * WHAT'S NOT WORKING:
 * ❌ Database constraint error during snapshot save:
 *     "NOT NULL constraint failed: inventory_snapshots_v2.sku"
 *     (This happens in the inventory tracker, not in this export script)
 * 
 * PERFORMANCE:
 * - Export generation: ~4 minutes (well within 20-minute limit)
 * - File size: 4.89 MB
 * - Row count: 112,841 products
 * 
 * USAGE:
 * - Test mode: node src/automation/flxpoint-export-working.js (with TEST_MODE=true)
 * - Production: node src/automation/daily-inventory-run.js
 * 
 * DO NOT MODIFY THIS FILE - Use as reference for future implementations
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const AUTH_FILE = path.join(__dirname, '../../auth/flxpoint-auth.json');

async function ensureAuth(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://app.flxpoint.com/login');
  
  // Login with credentials from environment variables
  await page.getByRole('textbox', { name: 'you@company.com' }).fill(process.env.FLXPOINT_EMAIL || 'cole@txfowlers.com');
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.FLXPOINT_PASSWORD || 'newuser123');
  
  await Promise.all([
    page.waitForNavigation(),
    page.getByRole('button', { name: 'Login' }).click(),
  ]);

  // Save authentication state for reuse
  await context.storageState({ path: AUTH_FILE });
  await context.close();
  console.log('Authentication saved successfully');
}

async function runExport(browser) {
  // Load existing auth or start fresh
  const context = await browser.newContext({
    storageState: fs.existsSync(AUTH_FILE) ? AUTH_FILE : undefined,
    acceptDownloads: true, // Enable file downloads
  });
  const page = await context.newPage();

  // Go to the app (should be logged in if auth.json exists)
  await page.goto('https://app.flxpoint.com/');
  
  // Wait for page to fully load
  await page.waitForLoadState('networkidle');
  
  // Check if we need to login by looking for login button
  const needsLogin = await page.getByRole('button', { name: 'Login' }).isVisible().catch(() => false);
  
  if (needsLogin) {
    console.log('Session expired, logging in again...');
    await ensureAuth(browser);
    // Reload context with new auth
    await context.close();
    const newContext = await browser.newContext({
      storageState: AUTH_FILE,
      acceptDownloads: true,
    });
    const newPage = await newContext.newPage();
    await newPage.goto('https://app.flxpoint.com/');
    await newPage.waitForLoadState('networkidle');
    await runExportSteps(newPage);
    await newContext.close();
  } else {
    console.log('Already logged in, proceeding with export...');
    await runExportSteps(page);
    await context.close();
  }
}

async function runExportSteps(page) {
  const isTestMode = process.env.TEST_MODE === 'true';
  const waitMinutes = isTestMode ? 5 : 20; // 5 minutes for testing, 20 for production
  
  console.log(`Starting export process... (Waiting ${waitMinutes} minutes after initiating)`);
  
  // EXACT SEQUENCE FROM SUCCESSFUL RECORDING:
  
  // 1. Navigate to Products (using robust selector strategy)
  console.log('Step 1: Navigating to Products...');
  
  // Use the robust selector approach from the working old script
  try {
    // Try the href-based selector first (most reliable)
    await page.locator('a[href*="/products"]').first().click({ timeout: 5000 });
    console.log('✅ Clicked Products via href selector');
  } catch (e1) {
    console.log('Could not find Products link with href, trying alternatives...');
    
    try {
      // Try the exact selector from recording as fallback
      await page.getByRole('link', { name: 'Products ' }).click({ timeout: 5000 });
      console.log('✅ Clicked Products via role selector');
    } catch (e2) {
      try {
        // Try data-tooltip approach
        await page.locator('a[data-tooltip="Products"]').click({ timeout: 5000 });
        console.log('✅ Clicked Products via tooltip selector');
      } catch (e3) {
        // Take a screenshot for debugging
        await page.screenshot({ path: 'debug-products-not-found.png' });
        console.log('Screenshot saved: debug-products-not-found.png');
        throw new Error('Could not find Products link with any selector');
      }
    }
  }
  
  await page.waitForLoadState('networkidle');
  
  // 2. Select all products (CRITICAL STEP - missing from other scripts)
  console.log('Step 2: Selecting all products...');
  await page.locator('thead').getByRole('cell').filter({ hasText: /^$/ }).locator('div').click();
  await page.getByText('Select all 50+ variants').click();
  
  // 3. Open Actions menu
  console.log('Step 3: Opening Actions menu...');
  await page.getByRole('button', { name: 'Actions' }).click();
  
  // 4. Click Export
  console.log('Step 4: Clicking Export...');
  await page.getByText('Export').click();
  
  // 5. Configure export columns (exact sequence from recording)
  console.log('Step 5: Configuring export columns...');
  await page.locator('div:nth-child(4) > .button').first().click();
  await page.locator('.fa.fa-times').first().click();
  await page.locator('div:nth-child(2) > .flex-con > div:nth-child(4) > .button > .fa').click();
  await page.locator('div:nth-child(2) > .flex-con > div:nth-child(4) > .button > .fa').click();
  await page.locator('div:nth-child(4) > .flex-con > div:nth-child(4) > .button > .fa').click();
  await page.locator('div:nth-child(4) > .flex-con > div:nth-child(4) > .button > .fa').click();
  await page.locator('div:nth-child(4) > .flex-con > div:nth-child(4) > .button > .fa').click();
  await page.locator('div:nth-child(4) > .flex-con > div:nth-child(4) > .button > .fa').click();
  await page.locator('div:nth-child(4) > .flex-con > div:nth-child(4) > .button > .fa').click();
  
  // 6. Start the export
  console.log('Step 6: Starting export generation...');
  await page.getByRole('button', { name: 'Export' }).click();
  
  // 7. Wait for export to be generated with polling
  console.log(`Step 7: Waiting for export generation (up to ${waitMinutes} minutes)...`);
  console.log('Polling for "Download Export" button every 30 seconds...');
  
  const maxWaitMs = waitMinutes * 60 * 1000;
  const pollIntervalMs = 30 * 1000; // Check every 30 seconds
  const startTime = Date.now();
  let downloadReady = false;
  
  while (Date.now() - startTime < maxWaitMs && !downloadReady) {
    await page.waitForTimeout(pollIntervalMs);
    
    try {
      // Check if the Download Export button is visible
      const downloadButton = page.getByRole('link', { name: 'Download Export' });
      const isVisible = await downloadButton.isVisible({ timeout: 2000 });
      
      if (isVisible) {
        downloadReady = true;
        console.log('✅ Download Export button is ready!');
        break;
      } else {
        const elapsed = Math.round((Date.now() - startTime) / 1000 / 60 * 10) / 10;
        console.log(`  Still waiting... (${elapsed} minutes elapsed)`);
      }
    } catch (error) {
      const elapsed = Math.round((Date.now() - startTime) / 1000 / 60 * 10) / 10;
      console.log(`  Still waiting... (${elapsed} minutes elapsed)`);
    }
  }
  
  if (!downloadReady) {
    throw new Error(`Export did not complete within ${waitMinutes} minutes. Download button never appeared.`);
  }
  
  // 8. Download the export
  console.log('Step 8: Downloading export...');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download Export' }).click();
  const download = await downloadPromise;
  
  // 9. Save the file to the correct directory
  const dir = path.join(__dirname, '../../exports'); // Correct path!
  fs.mkdirSync(dir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `flxpoint-export-${timestamp}.csv`;
  const filePath = path.join(dir, filename);
  
  await download.saveAs(filePath);
  console.log(`Export saved to: ${filePath}`);
  
  // 10. Verify the export file
  console.log('Step 9: Verifying export...');
  const stats = fs.statSync(filePath);
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  
  if (stats.size < 1024 * 1024) { // Less than 1MB
    console.warn('⚠️ Warning: Export file seems small, may be incomplete');
  } else {
    console.log('✅ Export completed successfully!');
  }
}

// Main execution
(async () => {
  const isTestMode = process.env.TEST_MODE === 'true';
  const showBrowser = process.env.SHOW_BROWSER === 'true' || isTestMode;
  
  console.log(`🚀 Starting FLXPoint Export (${isTestMode ? 'TEST MODE' : 'PRODUCTION MODE'})`);
  
  const browser = await chromium.launch({ 
    headless: !showBrowser,  // Show browser when requested
    slowMo: showBrowser ? 500 : 0  // Slow down actions when browser is visible
  });
  
  try {
    // Check if we have saved auth, if not, login first
    if (!fs.existsSync(AUTH_FILE)) {
      console.log('No saved authentication found. Logging in...');
      await ensureAuth(browser);
    }
    
    // Run the export
    await runExport(browser);
    
    console.log('🎉 Export process completed successfully!');
    
  } catch (error) {
    console.error('❌ Export failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
