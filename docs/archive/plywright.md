import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://app.flxpoint.com/login');
  await page.getByRole('textbox', { name: 'you@company.com' }).click();
  await page.getByRole('textbox', { name: 'you@company.com' }).fill('cole@txfowlers.com');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('newuser123');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('link', { name: 'Products ' }).click();
  await page.locator('thead').getByRole('cell').filter({ hasText: /^$/ }).locator('div').click();
  await page.getByText('Select all 50+ variants').click();
  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByText('Export').click();
  await page.locator('div:nth-child(4) > .button').first().click();
  await page.locator('div:nth-child(4) > .button').first().click();
  await page.locator('div:nth-child(2) > .flex-con > div:nth-child(4) > .button').click();
  await page.locator('div:nth-child(2) > .flex-con > div:nth-child(4) > .button').click();
  await page.locator('div:nth-child(4) > .flex-con > div:nth-child(4) > .button').click();
  await page.locator('div:nth-child(4) > .flex-con > div:nth-child(4) > .button').click();
  await page.locator('div:nth-child(4) > .flex-con > div:nth-child(4) > .button').click();
  await page.locator('div:nth-child(4) > .flex-con > div:nth-child(4) > .button > .fa').click();
  await page.locator('div:nth-child(4) > .flex-con > div:nth-child(4) > .button > .fa').click();
  await page.getByRole('button', { name: 'Export' }).click();

  Wait 7 min but check periodically

  
    const page3Promise = page.waitForEvent('popup');
  const download2Promise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download Export' }).click();
  const page3 = await page3Promise;
  const download2 = await download2Promise;
});