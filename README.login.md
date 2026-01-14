# Login Architecture: AutoPilot + LoginPilot

Playwright Pilot provides a clean separation between cross-application workflows (AutoPilot) and application-specific login implementations (LoginPilot). This architecture enables `autoPilot.login()` to work across all features without coupling tests to specific login page selectors.

## Why AutoPilot Exists

AutoPilot provides **cross-application actions** that work consistently across all features:

- `autoPilot.login()` - Logs into the application
- `autoPilot.logout()` - Logs out of the application
- `autoPilot.navigateTo(path)` - Navigates to a path
- `autoPilot.waitForAppReady()` - Waits for application to be ready

Tests can call `await autoPilot.login()` without knowing:

- What the login page URL is
- What the email/password field selectors are
- What the submit button selector is

## Why LoginPilot Exists

LoginPilot **decouples login selectors from the framework**. Each application implements its own login flow via a `LoginPilot` adapter, allowing:

- Different applications to have different login UIs
- Login page changes to be isolated to one file
- Tests to remain unchanged when login UI changes

## How It Works

### Architecture Overview

```
Test
  ↓
autoPilot.login()
  ↓
LoginPilot.goto() + LoginPilot.submit()
  ↓
LoginPage.toLoginPilot()
  ↓
LoginPage.navigateToLogin() + LoginPage.enterLoginCredentials() + LoginPage.clickLoginButton()
```

### The Flow

1. **Test calls `autoPilot.login()`**
2. **AutoPilot calls `LoginPilot.goto()`** - Navigates to login page
3. **AutoPilot calls `LoginPilot.submit(username, password)`** - Performs login
4. **LoginPilot is implemented by `LoginPage.toLoginPilot()`** - Adapter pattern
5. **LoginPage methods execute** - Actual page interactions

### Fixtures Wiring

The fixtures wire everything together, keeping tests clean by passing page objects and helpers through a single fixture system instead of requiring manual instantiation in each test.

**Why fixtures keep tests clean:**

- Tests receive page objects via fixtures (e.g., `{ loginPage, autoPilot }`) instead of manually instantiating them with `new LoginPage(page)` or `new AutoPilot(page, loginPilot)`
- All wiring happens once in the fixtures file, not repeated in every test
- Tests focus on test logic, not object creation

The fixtures wire everything together:

```typescript
// tests/fixtures/test-fixtures.ts
import { LoginPage } from "../../src/pages/login-page/LoginPage";
import { AutoPilot, type LoginPilot } from "../../src/utils/autoPilot";

type Fixtures = {
  autoPilot: AutoPilot;
  loginPilot: LoginPilot;
  loginPage: LoginPage;
};

export const test = base.extend<Fixtures>({
  // 1. Create LoginPage instance
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  // 2. Create LoginPilot adapter from LoginPage
  loginPilot: async ({ loginPage }, use) => {
    await use(loginPage.toLoginPilot());
  },

  // 3. Create AutoPilot with LoginPilot
  autoPilot: async ({ page, loginPilot }, use) => {
    await use(new AutoPilot(page, loginPilot));
  },
});
```

## Implementing toLoginPilot()

When you create a Login page using the CLI, it generates a stubbed `toLoginPilot()` method. You must replace the `throw new Error()` with your actual implementation.

### Generated Stub

```typescript
// src/pages/login-page/LoginPage.ts
toLoginPilot() {
  return {
    goto: async () => {
      await this.navigateToLogin();
    },
    submit: async (username: string, password: string) => {
      // TODO: Replace the error below with your login implementation.
      // Example:
      //   await this.enterUsername(username);
      //   await this.enterPassword(password);
      //   await this.clickLoginButton();
      throw new Error(
        "Login submission is not configured. Implement submit() in LoginPage.toLoginPilot() using your app's locators."
      );
    },
  };
}
```

### Replace with Implementation

```typescript
// src/pages/login-page/LoginPage.ts
toLoginPilot() {
  return {
    goto: async () => {
      await this.navigateToLogin();
    },
    submit: async (username: string, password: string) => {
      // Replace this stub with your actual implementation:
      await this.enterLoginCredentials(username, password);
      await this.clickLoginButton();
    },
  };
}
```

### Complete Example

```typescript
// src/pages/login-page/LoginPage.ts
import type { Page } from "@playwright/test";

export class LoginPage {
  private locators = {
    emailField: '[data-testid="input-email"]',
    passwordField: '[data-testid="input-password"]',
    loginButton: '[data-testid="btn-submit-login"]',
  };

  constructor(private page: Page) {}

  async navigateToLogin() {
    await this.page.goto("/login");
    await this.page.locator(this.locators.emailField).waitFor({ timeout: 10000 });
  }

  async enterLoginCredentials(email: string, password: string) {
    await this.page.locator(this.locators.emailField).fill(email);
    await this.page.locator(this.locators.passwordField).fill(password);
  }

  async clickLoginButton() {
    await this.page.locator(this.locators.loginButton).click();
  }

  // Creates a LoginPilot adapter for AutoPilot.login()
  toLoginPilot() {
    return {
      goto: async () => {
        await this.navigateToLogin();
      },
      submit: async (username: string, password: string) => {
        await this.enterLoginCredentials(username, password);
        await this.clickLoginButton();
      },
    };
  }
}
```

## Using AutoPilot in Tests

### Basic Usage

```typescript
import { test, expect } from "../../fixtures/test-fixtures";

test.describe.serial("DASH-101 - Dashboard @dashboard", () => {
  test("[10001] User can view dashboard after login", async ({ page, autoPilot }) => {
    // Login using AutoPilot (works across all features)
    await test.step("Login to application", async () => {
      await autoPilot.login();
    });

    // Verify successful login
    await test.step("Verify dashboard is visible", async () => {
      await expect(page).toHaveURL(/dashboard/);
    });
  });
});
```

### With Custom Credentials

```typescript
test("[10002] Admin can view admin dashboard", async ({ page, autoPilot }) => {
  // Login with custom credentials
  await autoPilot.login("admin@example.com", "admin123");

  // Verify admin dashboard
  await expect(page).toHaveURL(/admin\/dashboard/);
});
```

### Credentials from Environment

If you don't pass credentials, AutoPilot uses environment variables:

```env
LOGIN_EMAIL=user@example.com
LOGIN_PASSWORD=password123
```

```typescript
// Uses LOGIN_EMAIL and LOGIN_PASSWORD from .env
await autoPilot.login();
```

## When to Use loginPilot Directly

**Use `loginPilot` directly only for login-specific tests:**

- Testing invalid password scenarios
- Testing error states
- Testing login form validation
- Testing login-specific UI elements

**For all other tests, use `autoPilot.login()`:**

- ✅ Dashboard tests
- ✅ Feature tests that require authentication
- ✅ Cross-feature workflows

### Example: Login-Specific Test

```typescript
import { test, expect } from "../../fixtures/test-fixtures";

test.describe.serial("LOGI-101 - User Login @login-page", () => {
  test("[10001] User cannot login with invalid password", async ({ page, loginPilot }) => {
    // Use loginPilot directly for login-specific testing
    await test.step("Navigate to login page", async () => {
      await loginPilot.goto();
    });

    await test.step("Enter invalid credentials", async () => {
      await loginPilot.submit("user@example.com", "wrongpassword");
    });

    await test.step("Verify error message", async () => {
      await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
    });
  });
});
```

### Example: Feature Test (Use AutoPilot)

```typescript
import { test, expect } from "../../fixtures/test-fixtures";

test.describe.serial("DASH-101 - Dashboard @dashboard", () => {
  test("[10001] User can view dashboard", async ({ page, autoPilot }) => {
    // Use autoPilot for cross-feature workflows
    await autoPilot.login();

    // Test dashboard functionality
    await expect(page).toHaveURL(/dashboard/);
  });
});
```

## AutoPilot Methods

### login()

Logs into the application using the configured LoginPilot.

```typescript
// Uses environment variables
await autoPilot.login();

// With custom credentials
await autoPilot.login("user@example.com", "password123");
```

**Behavior:**

1. Calls `loginPilot.goto()` to navigate to login page
2. Calls `loginPilot.submit(username, password)` to perform login
3. Waits for app to be ready (checks for `[data-testid="app-ready"]` or URL change)

### logout()

Logs out of the application.

```typescript
await autoPilot.logout();
```

**Behavior:**

1. Clicks logout button (`[data-testid="logout"]`)
2. Waits for redirect to login page

### navigateTo(path)

Navigates to a path within the application.

```typescript
await autoPilot.navigateTo("/dashboard");
```

### waitForAppReady(initialUrl?)

Waits for the application to be ready after login.

```typescript
await autoPilot.waitForAppReady();
```

**Behavior:**

1. Checks for `[data-testid="app-ready"]` indicator
2. Falls back to waiting for URL change if indicator doesn't exist

## LoginPilot Interface

The `LoginPilot` type defines the contract:

```typescript
export type LoginPilot = {
  // Navigates to the login page (or ensures the login form is visible)
  goto(): Promise<void>;

  // Performs the login interaction using provided credentials
  submit(username: string, password: string): Promise<void>;
};
```

Any object that implements this interface can be used as a `LoginPilot`.

## Troubleshooting

### "Login is not configured"

**Error:** `Login is not configured. Provide a LoginPilot implementation in your fixtures to enable autoPilot.login().`

**Solution:** Ensure `loginPilot` fixture is wired in `tests/fixtures/test-fixtures.ts`:

```typescript
loginPilot: async ({ loginPage }, use) => {
  await use(loginPage.toLoginPilot());
},
```

### "Login submission is not configured"

**Error:** `Login submission is not configured. Implement submit() in LoginPage.toLoginPilot() using your app's locators.`

**Solution:** Replace the `throw new Error()` in `toLoginPilot().submit()` with your actual login implementation in your `LoginPage` class.

### "Login credentials are required"

**Error:** `Login credentials are required. Set LOGIN_EMAIL and LOGIN_PASSWORD in .env file or pass as parameters.`

**Solution:** Either:

1. Set `LOGIN_EMAIL` and `LOGIN_PASSWORD` in `.env`
2. Pass credentials to `autoPilot.login(email, password)`

## See Also

- [README.md](./README.md) - Main documentation and bootstrap guide
- [README.testdata.md](./README.testdata.md) - Test data system (may reference stored system users for login)
