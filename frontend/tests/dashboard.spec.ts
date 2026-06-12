import { test, expect } from '@playwright/test';

test('SaaS Landing page successfully mounts and UI elements exist', async ({ page }) => {
  await page.goto('/');

  // Expect navbar
  await expect(page.locator('.logo')).toHaveText('CarbonImpact.ai');
  
  // Expect Hero Section
  await expect(page.locator('.hero-text h1')).toContainText('Visualizing Global Carbon Debt');
  
  // Expect Canvas
  await expect(page.locator('.hero-canvas-container canvas')).toBeVisible();
});

test('Clicking Hero Preview successfully expands the modal', async ({ page }) => {
  await page.goto('/');
  
  const canvasContainer = page.locator('.hero-canvas-container');
  await expect(canvasContainer).toHaveClass(/interactive-preview/);
  
  // Click to expand
  await canvasContainer.click();
  
  // Should transition to expanded mode
  await expect(canvasContainer).toHaveClass(/expanded-mode/);
  
  // Close view button should be visible
  const closeBtn = page.locator('.close-modal-btn');
  await expect(closeBtn).toBeVisible();
  
  // Click close
  await closeBtn.click();
  await expect(canvasContainer).toHaveClass(/interactive-preview/);
});

test('Side-drawer simulator opens securely, and form inputs function', async ({ page }) => {
  await page.goto('/');
  
  const drawer = page.locator('.simulator-drawer');
  await expect(drawer).toHaveClass(/drawer-closed/);
  
  // Open simulator
  await page.locator('.hero-btn').click();
  await expect(drawer).toHaveClass(/drawer-open/);
  
  // Form input check
  const transitInput = page.locator('input').nth(0);
  await transitInput.fill('50');
  await expect(transitInput).toHaveValue('50');
  
  const calculateBtn = page.locator('.calculate-btn');
  await expect(calculateBtn).toBeVisible();
  
  // Close simulator
  await page.locator('.close-btn').click();
  await expect(drawer).toHaveClass(/drawer-closed/);
});
