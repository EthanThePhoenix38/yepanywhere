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

/**
 * Helper function to perform login through the remote client UI.
 */
async function loginViaRemoteClient(
  page: import("@playwright/test").Page,
  remoteClientURL: string,
  wsURL: string,
  username: string,
  password: string,
) {
  await page.goto(remoteClientURL);
  await page.fill('[data-testid="ws-url-input"]', wsURL);
  await page.fill('[data-testid="username-input"]', username);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-button"]');

  // Wait for login form to disappear
  await expect(page.locator('[data-testid="login-form"]')).not.toBeVisible({
    timeout: 10000,
  });

  // Verify sidebar is visible (main app loaded)
  await expect(page.locator(".sidebar")).toBeVisible({ timeout: 5000 });
}

test.describe("Encrypted Data Flow", () => {
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

  test("sidebar navigation loads via SecureConnection", async ({
    page,
    remoteClientURL,
    wsURL,
  }) => {
    await loginViaRemoteClient(
      page,
      remoteClientURL,
      wsURL,
      TEST_USERNAME,
      TEST_PASSWORD,
    );

    // The sidebar should show navigation items (loaded via encrypted WS)
    // Check for navigation links which proves API requests work
    await expect(page.locator('a[href="/projects"]')).toBeVisible();
    await expect(page.locator('a[href="/settings"]')).toBeVisible();
    await expect(page.locator('a[href="/inbox"]')).toBeVisible();
  });

  test("activity subscription receives events", async ({
    page,
    remoteClientURL,
    wsURL,
  }) => {
    await loginViaRemoteClient(
      page,
      remoteClientURL,
      wsURL,
      TEST_USERNAME,
      TEST_PASSWORD,
    );

    // The sidebar shows recent sessions, which requires activity subscription
    // Check that the "Last 24 Hours" section is visible (populated by activity events)
    // Note: This section only appears if there are sessions, so we check for sidebar-section
    const sidebarSections = page.locator(".sidebar-section");

    // Should have at least one section (Starred or Last 24 Hours)
    // This proves the activity subscription is working
    await expect(sidebarSections.first()).toBeVisible({ timeout: 5000 });
  });

  test("mock project visible in sidebar", async ({
    page,
    remoteClientURL,
    wsURL,
  }) => {
    await loginViaRemoteClient(
      page,
      remoteClientURL,
      wsURL,
      TEST_USERNAME,
      TEST_PASSWORD,
    );

    // The mock project session should be visible in the sidebar
    // This proves session data is loaded via encrypted WebSocket
    await expect(page.getByText("mockproject").first()).toBeVisible({
      timeout: 5000,
    });
  });
});
