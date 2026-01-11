/**
 * E2E tests for Remote Login Flow (Phase 3.6).
 *
 * Tests the full user experience of loading the remote client,
 * entering credentials, and using the app through an encrypted
 * WebSocket connection.
 */

import {
  configureRemoteAccess,
  disableRemoteAccess,
  expect,
  test,
} from "./fixtures.js";

// Test credentials
const TEST_USERNAME = "e2e-test-user";
const TEST_PASSWORD = "test-password-123";

test.describe("Remote Login Flow", () => {
  test.beforeEach(async ({ baseURL, page }) => {
    // Configure remote access with test credentials
    await configureRemoteAccess(baseURL, {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    // Clear localStorage for fresh state
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test.afterEach(async ({ baseURL }) => {
    await disableRemoteAccess(baseURL);
  });

  test("login page renders correctly", async ({ page, remoteClientURL }) => {
    await page.goto(remoteClientURL);

    // Verify login form is visible
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="ws-url-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="username-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
  });

  test("successful login renders main app", async ({
    page,
    remoteClientURL,
    wsURL,
  }) => {
    await page.goto(remoteClientURL);

    // Fill in login form
    await page.fill('[data-testid="ws-url-input"]', wsURL);
    await page.fill('[data-testid="username-input"]', TEST_USERNAME);
    await page.fill('[data-testid="password-input"]', TEST_PASSWORD);

    // Submit form
    await page.click('[data-testid="login-button"]');

    // Wait for login form to disappear (indicates successful login)
    await expect(page.locator('[data-testid="login-form"]')).not.toBeVisible({
      timeout: 10000,
    });

    // Verify we're no longer on the login page
    // The main app should be visible (look for sidebar which is always present)
    await expect(page.locator(".sidebar")).toBeVisible({
      timeout: 5000,
    });
  });

  test("wrong password shows error", async ({
    page,
    remoteClientURL,
    wsURL,
  }) => {
    await page.goto(remoteClientURL);

    // Fill in login form with wrong password
    await page.fill('[data-testid="ws-url-input"]', wsURL);
    await page.fill('[data-testid="username-input"]', TEST_USERNAME);
    await page.fill('[data-testid="password-input"]', "wrong-password");

    // Submit form
    await page.click('[data-testid="login-button"]');

    // Verify error message appears
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible({
      timeout: 10000,
    });

    // Verify we're still on login page
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test("unknown username shows error", async ({
    page,
    remoteClientURL,
    wsURL,
  }) => {
    await page.goto(remoteClientURL);

    // Fill in login form with unknown username
    await page.fill('[data-testid="ws-url-input"]', wsURL);
    await page.fill('[data-testid="username-input"]', "unknown-user");
    await page.fill('[data-testid="password-input"]', TEST_PASSWORD);

    // Submit form
    await page.click('[data-testid="login-button"]');

    // Verify error message appears
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible({
      timeout: 10000,
    });

    // Verify we're still on login page
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test("server unreachable shows connection error", async ({
    page,
    remoteClientURL,
  }) => {
    await page.goto(remoteClientURL);

    // Fill in login form with unreachable server
    await page.fill(
      '[data-testid="ws-url-input"]',
      "ws://localhost:9999/api/ws",
    );
    await page.fill('[data-testid="username-input"]', TEST_USERNAME);
    await page.fill('[data-testid="password-input"]', TEST_PASSWORD);

    // Submit form
    await page.click('[data-testid="login-button"]');

    // Verify error message appears
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible({
      timeout: 10000,
    });

    // Verify we're still on login page
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test("empty fields show validation error", async ({
    page,
    remoteClientURL,
  }) => {
    await page.goto(remoteClientURL);

    // Clear the server URL field (it has a default value)
    await page.fill('[data-testid="ws-url-input"]', "");

    // Submit form with empty fields
    await page.click('[data-testid="login-button"]');

    // Verify error message appears (client-side validation)
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-error"]')).toContainText(
      /required/i,
    );
  });
});
