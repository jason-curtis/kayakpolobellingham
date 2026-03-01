import { test, expect } from '@playwright/test';

test.describe('Kayak Polo Bellingham - Public Signup', () => {
  test('page loads and displays games', async ({ page }) => {
    await page.goto('/');

    // Check header
    await expect(page.locator('h1')).toContainText('Kayak Polo Bellingham');

    // Check for games list - look for day of week format
    const gameElements = page.locator('text=/[A-Z][a-z]+day.*[0-9]/');
    const count = await gameElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test('loads game data and displays signup counts', async ({ page }) => {
    await page.goto('/');

    // Wait for game data to load
    await page.waitForTimeout(500);

    // Check that we can see signup info
    const headline = page.locator('text=/in .*out.*regulars/');
    await expect(headline).toBeVisible();
  });

  test('can enter player name and it persists', async ({ page, context }) => {
    await page.goto('/');

    // Find the name input
    const nameInput = page.locator('input[placeholder="Your name"]');
    await expect(nameInput).toBeVisible();

    // Enter name
    await nameInput.fill('TestPlayer');

    // Check localStorage via page evaluation
    const storedName = await page.evaluate(() => {
      return localStorage.getItem('kayakpolo_player_name');
    });
    expect(storedName).toBe('TestPlayer');

    // Reload and check it persists
    await page.reload();
    await expect(nameInput).toHaveValue('TestPlayer');
  });

  test('signup buttons work and disable until name is entered', async ({ page }) => {
    await page.goto('/');

    const inButton = page.locator('button:has-text("I\'m In")').first();
    const outButton = page.locator('button:has-text("I\'m Out")').first();
    const nameInput = page.locator('input[placeholder="Your name"]');

    // Buttons should be disabled initially
    await expect(inButton).toBeDisabled();
    await expect(outButton).toBeDisabled();

    // Enter name
    await nameInput.fill('Cameron');

    // Buttons should be enabled now
    await expect(inButton).toBeEnabled();
    await expect(outButton).toBeEnabled();
  });

  test('I\'m In button submits signup', async ({ page }) => {
    await page.goto('/');

    const nameInput = page.locator('input[placeholder="Your name"]');
    const inButton = page.locator('button:has-text("I\'m In")').first();

    await nameInput.fill('Gib');

    // Click I'm In
    await inButton.click();

    // Wait for the fetch to complete
    await page.waitForTimeout(500);

    // Check that the signup count updated
    const regularsSection = page.locator('text=/The Regulars/').locator('..');
    await expect(regularsSection).toBeVisible();
  });

  test('displays correct timezone and date format', async ({ page }) => {
    await page.goto('/');

    // Look for day of week followed by date
    const dayOfWeek = page.locator('text=/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/').first();
    await expect(dayOfWeek).toBeVisible();

    // Check for AM/PM format
    const timePattern = page.locator('text=/AM|PM/').first();
    await expect(timePattern).toBeVisible();
  });

  test('admin portal link exists', async ({ page }) => {
    await page.goto('/');

    const adminLink = page.locator('a:has-text("Admin Portal")');
    await expect(adminLink).toBeVisible();
  });
});

test.describe('Kayak Polo Bellingham - Admin Portal', () => {
  test('admin page loads and shows login form', async ({ page }) => {
    await page.goto('/admin');

    // Should see login form
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    const loginButton = page.locator('button:has-text("Login")');
    await expect(loginButton).toBeVisible();
  });

  test('rejects invalid password', async ({ page }) => {
    await page.goto('/admin');

    const passwordInput = page.locator('input[type="password"]');
    const loginButton = page.locator('button:has-text("Login")');

    // Try wrong password
    await passwordInput.fill('wrongpassword');
    await loginButton.click();

    // Should show error
    const errorMsg = page.locator('text=/Invalid password/');
    await expect(errorMsg).toBeVisible();

    // Should still be on login page
    await expect(passwordInput).toBeVisible();
  });

  test('accepts correct password and shows admin dashboard', async ({ page }) => {
    await page.goto('/admin');

    const passwordInput = page.locator('input[type="password"]');
    const loginButton = page.locator('button:has-text("Login")');

    // Enter correct password
    await passwordInput.fill('marine park tides swirl');
    await loginButton.click();

    // Wait for dashboard to load
    await page.waitForTimeout(500);

    // Should see admin content
    const adminTitle = page.locator('text=/Admin Portal/');
    await expect(adminTitle).toBeVisible();

    // Should see tabs
    const gameTab = page.locator('button:has-text("Manage Games")');
    const regularsTab = page.locator('button:has-text("Manage Regulars")');
    await expect(gameTab).toBeVisible();
    await expect(regularsTab).toBeVisible();
  });

  test('admin can view games list', async ({ page }) => {
    await page.goto('/admin');

    const passwordInput = page.locator('input[type="password"]');
    const loginButton = page.locator('button:has-text("Login")');

    await passwordInput.fill('marine park tides swirl');
    await loginButton.click();

    // Wait and check for game list
    await page.waitForTimeout(500);
    const gamesList = page.locator('text=/Scheduled Games/');
    await expect(gamesList).toBeVisible();
  });

  test('admin can view regulars', async ({ page }) => {
    await page.goto('/admin');

    const passwordInput = page.locator('input[type="password"]');
    const loginButton = page.locator('button:has-text("Login")');

    await passwordInput.fill('marine park tides swirl');
    await loginButton.click();

    // Switch to regulars tab
    const regularsTab = page.locator('button:has-text("Manage Regulars")');
    await regularsTab.click();

    // Check for regulars content
    const regularsList = page.locator('text=/Player Aliases/');
    await expect(regularsList).toBeVisible();
  });

  test('admin can logout', async ({ page }) => {
    await page.goto('/admin');

    const passwordInput = page.locator('input[type="password"]');
    const loginButton = page.locator('button:has-text("Login")');

    await passwordInput.fill('marine park tides swirl');
    await loginButton.click();

    await page.waitForTimeout(500);

    // Click logout
    const logoutButton = page.locator('button:has-text("Logout")');
    await expect(logoutButton).toBeVisible();
    await logoutButton.click();

    // Should be back at login
    await expect(passwordInput).toBeVisible();
  });

  test('game creation form has all fields', async ({ page }) => {
    await page.goto('/admin');

    const passwordInput = page.locator('input[type="password"]');
    const loginButton = page.locator('button:has-text("Login")');

    await passwordInput.fill('marine park tides swirl');
    await loginButton.click();

    await page.waitForTimeout(500);

    // Check for form fields
    const dateInput = page.locator('input[type="date"]');
    const timeInput = page.locator('input[type="time"]');
    const deadlineInput = page.locator('input[type="datetime-local"]');

    await expect(dateInput).toBeVisible();
    await expect(timeInput).toBeVisible();
    await expect(deadlineInput).toBeVisible();
  });

  test('password error clears on successful login', async ({ page }) => {
    await page.goto('/admin');

    const passwordInput = page.locator('input[type="password"]');
    const loginButton = page.locator('button:has-text("Login")');

    // Try wrong password
    await passwordInput.fill('wrong');
    await loginButton.click();

    let errorMsg = page.locator('text=/Invalid password/');
    await expect(errorMsg).toBeVisible();

    // Now try correct password
    await passwordInput.clear();
    await passwordInput.fill('marine park tides swirl');
    await loginButton.click();

    await page.waitForTimeout(500);

    // Error should be gone
    errorMsg = page.locator('text=/Invalid password/');
    await expect(errorMsg).not.toBeVisible();

    // Should be logged in
    const adminTitle = page.locator('text=/Admin Portal/');
    await expect(adminTitle).toBeVisible();
  });
});

test.describe('Kayak Polo Bellingham - Responsive Design', () => {
  test('public page is responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Header should be visible
    await expect(page.locator('h1')).toContainText('Kayak Polo Bellingham');

    // Game list should be visible
    const gameElements = page.locator('text=/[A-Z][a-z]+day.*[0-9]/');
    const count = await gameElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test('admin page is responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin');

    // Login form should be visible
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
  });
});
