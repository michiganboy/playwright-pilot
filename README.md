# Playwright Pilot

A clean, maintainable Playwright automation framework featuring typed page objects, feature-based test organization, Azure DevOps integration, and a simple dataStore for cross-test data management. Built for clarity, scalability, and team-friendly testing.

## Features

- **Page Object Model (POM)** - Typed page objects with consistent selector patterns
- **Feature-Based Organization** - Tests organized by feature with automatic grouping
- **Test Data Factories** - Fluent API for creating test data with `.save()` pattern
- **Data Store** - JSON-backed persistence for sharing data across tests
- **Azure DevOps Integration** - Automatic sync of test results to ADO test plans
- **Custom Reporter** - Clean terminal output with progress bars and formatted error messages
- **TypeScript** - Full type safety throughout the framework

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Application
BASE_URL=http://localhost:3000
LOGIN_EMAIL=your-email@example.com
LOGIN_PASSWORD=your-password

# Azure DevOps (optional - for ADO sync)
ADO_AUTO_SYNC=false
ADO_ORG_URL=https://dev.azure.com/your-org
ADO_PROJECT=your-project
ADO_TOKEN=your-personal-access-token
BUILD_NUMBER=1.0.0
BUILD_ID=12345

# Test Plan Filtering (for ADO sync - optional)
# FEATURES: If not set, features are auto-detected from test tags in the report
# SUITES: Optional filter for suite IDs (only when single feature selected)
# CASES: Optional filter for test case IDs (only when single feature and single suite selected)
# FEATURES=authentication,enrollment
# SUITES=7,8
# CASES=AUTH-9,ENR-101
```

### Environment Variables

- `BASE_URL` - Base URL for the application under test
- `LOGIN_EMAIL` - Default email for login tests
- `LOGIN_PASSWORD` - Default password for login tests
- `ADO_AUTO_SYNC` - Set to `"true"` to automatically sync test results to Azure DevOps after test runs
- `ADO_ORG_URL` - Your Azure DevOps organization URL
- `ADO_PROJECT` - Your Azure DevOps project name
- `ADO_TOKEN` - Azure DevOps Personal Access Token (PAT) with test management permissions
- `BUILD_NUMBER` - Build number for display in ADO test runs
- `BUILD_ID` - Build ID for linking test runs to builds (optional)
- `FEATURES` - Optional comma-separated list of feature keys from `featureConfig.json` to sync. If not set, features are automatically detected from test tags (e.g., `@authentication`) in the Playwright report
- `SUITES` - Optional comma-separated list of suite IDs to filter (only when single feature selected)
- `CASES` - Optional comma-separated list of test case IDs to filter (only when single feature and single suite selected)

**Note:** The actual test plan IDs and suite IDs are configured in `src/testdata/featureConfig.json`. If `FEATURES` is not set, the system automatically detects which features were tested by scanning the Playwright report for feature tags (e.g., `@authentication`) and matching them to features in `featureConfig.json`.

## Project Structure

```
playwright-pilot/
├── src/
│   ├── integrations/
│   │   └── azureDevops/       # Azure DevOps sync integration
│   ├── pages/                  # Page Object Model classes
│   │   ├── login/
│   │   ├── dashboard/
│   │   └── ...
│   ├── testdata/
│   │   ├── factories/         # Test data factories
│   │   ├── models/            # TypeScript models
│   │   ├── dataStore.json     # Cross-test data persistence
│   │   └── featureConfig.json # Feature configuration for ADO
│   └── utils/
│       ├── custom-list-reporter.ts  # Custom Playwright reporter
│       ├── dataStore.ts       # Data store utilities
│       ├── featureConfig.ts   # Feature configuration loader
│       └── globalActions.ts    # Shared test actions
├── tests/
│   ├── e2e/                   # End-to-end tests organized by feature
│   │   ├── authentication/
│   │   ├── enrollment/
│   │   └── ...
│   ├── fixtures/              # Playwright fixtures
│   └── test-utilities/         # Utility tests
├── playwright.config.ts        # Playwright configuration
├── global-teardown.ts         # Global teardown hook
└── package.json
```

## Usage

### Running Tests

```bash
# Run all tests
npm test

# Run tests in UI mode
npm run test:ui

# Run tests in headed mode (see browser)
npm run test:headed

# Run tests in debug mode
npm run test:debug

# Run specific test file
npm test -- tests/e2e/authentication/AUTH-9-user-authentication-flow.spec.ts

# Run tests matching a pattern
npm test -- --grep @authentication
```

### Azure DevOps Sync

```bash
# Manual sync (after test run)
npm run sync:ado

# Automatic sync (set ADO_AUTO_SYNC=true in .env)
# Syncs automatically after each test run
```

## Pilot CLI

The `pilot` CLI tool automates framework scaffolding and maintenance, ensuring consistent wiring across the codebase.

### Getting Help

```bash
# Show general help
npm run pilot -- --help
# or
npm run pilot help

# Show help for a specific command
npm run pilot add:feature --help
```

### Creating Features

Features define ADO mapping, tags, and test folder scaffolding. ADO plan ID and suite IDs are required.

```bash
# Create a feature (will prompt for planId and suites if not provided)
npm run pilot add:feature "User Management"

# Create a feature with all options
npm run pilot add:feature "User Management" --plan-id 105 --suites "5005,5006"

# The command will:
# - Normalize the name to a safe key (e.g., "user-management")
# - Add entry to src/testdata/featureConfig.json
# - Create tests/e2e/user-management/ directory
# - Create an initial spec file with proper imports and structure
# - Optionally create a matching page object if one doesn't exist
```

**Feature Creation Flow:**
1. Normalizes the feature name to a safe kebab-case key
2. Prompts for Azure DevOps Plan ID if not provided via `--plan-id`
3. Prompts for Azure DevOps Suite IDs (comma-separated) if not provided via `--suites`
4. Checks for existing pages matching the feature name
5. If matching pages found, asks if you want to use them as the primary page object
6. If no matching pages, optionally prompts to create a new page
7. Creates the test directory and initial spec file
8. Adds the feature configuration to `featureConfig.json`

**Example Output:**
```
  Normalized feature name: "User Management" → "user-management"
✓ Created feature: user-management
✓ Added to featureConfig.json
✓ Created test directory: tests/e2e/user-management
✓ Created initial spec: USER-101-user-management.spec.ts
```

### Creating Pages

Pages can be created independently or as part of feature creation.

```bash
# Create a page (uses page name as feature key for directory)
npm run pilot add:page "UserProfile"

# Create a page under a specific feature
npm run pilot add:page "UserProfile" --feature "user-management"

# The command will:
# - Create src/pages/<featureKey>/<PageName>Page.ts
# - Automatically wire it into tests/fixtures/test-fixtures.ts:
#   * Add import statement
#   * Add entry to Fixtures type
#   * Add entry to base.extend
```

**Page Template Includes:**
- Placeholder locators with data-testid selectors
- Example methods (navigate, open, actions)
- Health check method for verifying key elements

**Example Output:**
```
  Normalized page name: "UserProfile" → "user-profile"
✓ Created page: src/pages/user-profile/UserProfilePage.ts
✓ Wired fixture: userProfilePage
```

### Creating Specs

Add additional spec files to existing features.

```bash
# Create a spec under an existing feature
npm run pilot add:spec "User Login Flow" --feature "user-management"

# The command will:
# - Verify the feature exists in featureConfig.json
# - Create a new spec file in tests/e2e/<featureKey>/
# - Use the same template conventions as feature creation
# - Auto-detect page fixtures for the feature
```

**Spec Template Includes:**
- Required imports (test-fixtures, factories, dataStore)
- `test.describe.serial` with feature tag
- Header comment with feature key, tag, ADO plan ID, and suite IDs
- Example test steps using factories and dataStore
- Proper factory/save/load pattern matching existing specs

**Example Output:**
```
✓ Created spec: tests/e2e/user-management/USER-102-user-login-flow.spec.ts
```

### Creating Factories

Data factories follow the existing pattern with faker and save methods.

```bash
# Create a factory
npm run pilot add:factory "Product"

# The command will:
# - Create src/testdata/factories/product.factory.ts
# - Add export to src/testdata/factories/index.ts
```

**Factory Template Includes:**
- Faker imports and model typing
- `create<ModelName>()` function with overrides parameter
- `.save()` method with DataStoreMap typing
- Placeholder fields that you can customize

**Example Output:**
```
  Normalized model name: "Product" → "product"
✓ Created factory: src/testdata/factories/product.factory.ts
✓ Added export to src/testdata/factories/index.ts
```

### Deleting Resources

All delete operations require typed confirmation and check for references.

#### Delete Feature

```bash
# Delete a feature (removes test folder and config entry, but NOT pages)
npm run pilot delete:feature "user-management"

# You must type exactly: "delete user-management"
```

**Safety Checks:**
- Requires typed confirmation matching the feature key
- Deletes test directory and featureConfig.json entry
- **Does NOT delete pages** (pages are global and may be used elsewhere)

#### Delete Page

```bash
# Delete a page (removes file and unwires fixtures)
npm run pilot delete:page "UserProfile"

# You must type exactly: "delete page user-profile"
```

**Safety Checks:**
- Blocks deletion if the page fixture is referenced in any `tests/**/*.spec.ts` files
- Requires typed confirmation: `delete page <normalized-name>`
- Removes the page file and all fixture wiring from `test-fixtures.ts`

#### Delete Factory

```bash
# Delete a factory (removes file and export)
npm run pilot delete:factory "Product"

# You must type exactly: "delete factory product"
```

**Safety Checks:**
- Blocks deletion if the factory function is referenced in any `tests/**/*.spec.ts` files
- Requires typed confirmation: `delete factory <normalized-name>`
- Removes the factory file and export from `factories/index.ts`

### Health Checks (Attendant)

The `attendant` command runs read-only health checks on framework structure.

```bash
# Run health checks
npm run pilot attendant
```

**Checks Performed:**
- ✅ Validates `featureConfig.json` entries have required fields (tag, planId, suites)
- ✅ Validates test directories exist for each feature
- ✅ Validates pages in `src/pages` are properly wired in `test-fixtures.ts`
- ⚠️ Warns about orphaned fixtures (wired but page doesn't exist)
- ✅ Validates each `*.factory.ts` is exported in `factories/index.ts`
- ⚠️ Warns about stale exports (exported but factory file doesn't exist)
- ⚠️ Warns about spec files missing required imports

**Example Output:**
```
🔍 Running health checks...

📊 Health Check Results:

✅ All checks passed!
```

Or if issues are found:

```
📊 Health Check Results:

❌ Errors:

   Feature "user-management": planId must be a positive number
   Page "UserProfile": fixture type entry missing in test-fixtures.ts

⚠️  Warnings:

   Factory export "product": factory file not found (stale export)
   Spec "tests/e2e/user-management/USER-101.spec.ts": missing factories import

Summary: 2 error(s), 1 warning(s)
```

### Input Normalization

The CLI automatically normalizes all input to safe kebab-case keys:
- Converts to lowercase
- Replaces spaces/underscores with dashes
- Removes special characters (only `[a-z0-9-]` allowed)
- Collapses repeated dashes
- Trims dashes from start/end

If normalization changes your input, the CLI will print: `Normalized <type>: "<original>" → "<normalized>"`

**Examples:**
- `"User Profile"` → `"user-profile"`
- `"Appointment_Booking"` → `"appointment-booking"`
- `"My--Feature"` → `"my-feature"`

### Fail-Safes

The CLI follows conservative behavior:
- **Never overwrites existing files** - If a file exists, the command errors and stops
- **Checks references before deletion** - Blocks deletion if resources are in use
- **Requires typed confirmation** - Delete operations require exact confirmation text
- **Validates required inputs** - Prompts for missing required fields (planId, suites)
- **Validates feature existence** - Spec creation requires the feature to exist first

### Command Reference

| Command | Description | Required Flags | Optional Flags |
|---------|-------------|----------------|----------------|
| `add:feature <name>` | Create feature with config, test folder, and initial spec | - | `--plan-id <id>`, `--suites <ids>` |
| `delete:feature <name>` | Delete feature (test folder and config) | - | - |
| `add:page <name>` | Create page object and wire fixtures | - | `--feature <key>` |
| `delete:page <name>` | Delete page and unwire fixtures | - | - |
| `add:spec <name>` | Create spec file under existing feature | `--feature <key>` | - |
| `add:factory <name>` | Create data factory and add export | - | - |
| `delete:factory <name>` | Delete factory and remove export | - | - |
| `attendant` | Run health checks (read-only) | - | - |
| `help` | Show help information | - | - |

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from "@playwright/test";
import { LoginPage } from "../../src/pages/login/LoginPage";

test.describe("@authentication", () => {
  test("[AUTH-9] Verify user can login with valid credentials", async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);

    await test.step("Navigate to login page", async () => {
      await loginPage.navigate();
    });

    await test.step("Enter credentials", async () => {
      await loginPage.fillEmail("user@example.com");
      await loginPage.fillPassword("password123");
    });

    await test.step("Submit login form", async () => {
      await loginPage.submit();
    });

    await test.step("Verify successful login", async () => {
      await expect(page).toHaveURL(/dashboard/);
    });
  });
});
```

### Using Test Data Factories

```typescript
import { UserFactory } from "../../src/testdata/factories";

test("Create and use test data", async ({ page }) => {
  const user = UserFactory.create()
    .withEmail("test@example.com")
    .withPassword("password123")
    .save();

  // Use user data in test
  const loginPage = new LoginPage(page);
  await loginPage.fillEmail(user.email);
  await loginPage.fillPassword(user.password);

  // Retrieve saved data later
  const savedUser = UserFactory.get(user.id);
});
```

### Using Data Store

```typescript
import { save, get } from "../../src/utils/dataStore";

test("Save and retrieve data", async ({ page }) => {
  const userId = "user-123";
  save("userId", userId);

  // Later in the same test or another test
  const retrievedUserId = get("userId");
});
```

## Page Objects

Page objects follow a consistent pattern:

```typescript
import { Page, Locator } from "@playwright/test";

export class LoginPage {
  private readonly page: Page;
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('[data-testid="email"]');
    this.passwordInput = page.locator('[data-testid="password"]');
    this.submitButton = page.locator('[data-testid="submit"]');
  }

  async navigate(): Promise<void> {
    await this.page.goto("/login");
  }

  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
```

## Test Data Factories

Factories use a fluent API pattern:

```typescript
import { UserFactory } from "../../src/testdata/factories";

// Create with defaults
const user = UserFactory.create().save();

// Create with custom values
const customUser = UserFactory.create()
  .withEmail("custom@example.com")
  .withPassword("custom123")
  .save();

// Retrieve saved data
const saved = UserFactory.get(customUser.id);
```

## Azure DevOps Integration

The framework can automatically sync test results to Azure DevOps test plans:

1. Configure `src/testdata/featureConfig.json` with your test plan IDs, suite IDs, and feature tags
2. Set environment variables for ADO connection (`ADO_ORG_URL`, `ADO_PROJECT`, `ADO_TOKEN`)
3. Optionally set `FEATURES` environment variable to explicitly select which features to sync. If not set, features are automatically detected from test tags in the Playwright report
4. Optionally set `SUITES` and `CASES` to filter specific suites or test cases
5. Enable auto-sync with `ADO_AUTO_SYNC=true` or run manual sync with `npm run sync:ado`

### Feature Configuration

The `featureConfig.json` file maps feature keys to their Azure DevOps test plan configuration:

```json
{
  "authentication": {
    "tag": "@authentication",
    "planId": 2,
    "suites": [7]
  }
}
```

- `tag` - The test tag used in Playwright tests (e.g., `@authentication`)
- `planId` - Azure DevOps test plan ID
- `suites` - Array of Azure DevOps suite IDs for this feature

Test results include:

- Test outcome (Passed/Failed/Skipped)
- Duration
- Error messages
- Test steps
- Build number and machine name
- Completed date/time

## Custom Reporter

The custom reporter provides:

- Real-time progress bars grouped by feature
- Clean test result output
- Formatted error messages with Expected/Received formatting
- Summary with passed/failed/skipped counts

## Contributing

1. Follow the existing code structure and patterns
2. Use TypeScript for type safety
3. Add comments for non-obvious requirements or caveats
4. Keep code DRY and clean
5. Write descriptive test names with case IDs

## License

See LICENSE file for details.
