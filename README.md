# Playwright Pilot

Playwright Pilot is a Playwright-based automation framework with a first-class CLI designed to enforce consistency, traceability, and alignment with Azure DevOps Test Plans.

The framework is built around features and suites, not ad-hoc test files. Everything maps cleanly back to Azure DevOps so automation reflects how tests are managed by QA and stakeholders.

---

### Pilot CLI (Core Feature)

The Pilot CLI is a first-class feature of this framework.

It automates:

- Feature creation and deletion
- Suite creation and deletion
- Page object creation and safe wiring
- Test data factory creation
- Health checks and validation

The CLI exists to ensure correct wiring, naming, and structure so engineers focus on writing tests instead of framework mechanics.

IMPORTANT:
Do not manually create or wire features, suites, pages, or factories. Always use the CLI.

---

### Azure DevOps → Framework Mapping

The framework is driven by Azure DevOps test management concepts.
Playwright files and APIs are implementation details.

FEATURE → Azure DevOps Test Plan

- One feature maps to one Azure DevOps test plan
- Features are defined in `src/testdata/featureConfig.json`
- Each feature has a unique tag (example: `@authentication`)
- Each feature owns one or more suites

SUITE → Azure DevOps Test Suite

- One suite maps to one Azure DevOps test suite
- One suite is implemented as exactly one spec file
- Suites are the **primary unit of work** in this framework
- Suites are defined under their feature in `featureConfig.json`
- Suites are implemented in Playwright using `test.describe.serial()`
- Spec filename format: `PREFIX-NUMBER-suite-name.spec.ts`  
  Example: `AUTH-101-user-login.spec.ts`

TEST CASE → Azure DevOps Test Case

- Each `test()` block represents one Azure DevOps test case
- Test case IDs appear in test titles  
  Example: `[AUTH-10001] User can log in`
- Multiple test cases can exist within a single suite

---

### Test Location

All automated tests live under:

tests/feature-key/

Examples:

- tests/authentication/
- tests/payment-processing/

There is no tests/e2e directory.
Test intent (smoke, regression, edge cases) is defined by Azure DevOps suites, not folder names.

---

### Pages Are Global

Page objects are global by design.

- Pages live in src/pages
- Pages are wired once via Playwright fixtures
- Pages may be used by multiple features and suites

Deleting a feature:

- Removes all suites and feature configuration
- Removes pages only if they are not referenced elsewhere

All of this is enforced by the CLI.

---

### Golden Rules

- Create test plans and suites in Azure DevOps first
- Use the Pilot CLI to **mirror your Azure DevOps test plan and suite structure** in the framework
- Do not hand-edit `featureConfig.json`
- Do not manually wire fixtures or page objects
- Do not create suite (spec) files by hand

### Project Structure

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
│   ├── authentication/        # Tests organized by feature
│   ├── user-management/
│   ├── appointments/
│   ├── fixtures/              # Playwright fixtures (global)
│   └── test-utilities/         # Utility tests
├── playwright.config.ts        # Playwright configuration
├── global-teardown.ts         # Global teardown hook
└── package.json
```

## First-Time Setup / Bootstrap

This section guides you through setting up the framework from scratch. If you're working in an existing repo, some features may already exist.

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Environment

Create a `.env` file in the root directory with your application and Azure DevOps settings (see [Configuration](#configuration) section above).

### Step 3: Create Your First Feature

Start with a foundational feature like Authentication or Login. **You must have your Azure DevOps test plan and suites created first.**

```bash
# Create your first feature
npm run pilot add:feature "Authentication"
```

The CLI will prompt you for:

- Azure DevOps Plan ID
- Suite names (e.g., "User Login", "User Registration")
- Suite IDs for each suite

This creates:

- Feature configuration in `src/testdata/featureConfig.json`
- Test directory: `tests/authentication/`
- One spec file per suite (e.g., `AUTH-101-user-login.spec.ts`)
- A page object (reused or created): `src/pages/authentication/AuthenticationPage.ts`

### Step 4: Edit the Generated Page Object

Open the generated page object file and update it with your actual selectors and methods:

```typescript
// src/pages/authentication/AuthenticationPage.ts
export class AuthenticationPage {
  private locators = {
    emailInput: '[data-testid="email"]', // Update with real selectors
    passwordInput: '[data-testid="password"]', // Update with real selectors
    submitButton: '[data-testid="login-button"]', // Update with real selectors
  };

  // Update navigation method with actual URL
  async navigateToAuthentication() {
    await this.page.goto("/login"); // Update with your app's login URL
    // ...
  }

  // Add your actual page interaction methods
  async fillEmail(email: string) {
    /* ... */
  }
  async fillPassword(password: string) {
    /* ... */
  }
  async submit() {
    /* ... */
  }
}
```

### Step 5: Implement Your First Test Cases

Open the generated suite file and implement your test cases:

```typescript
// tests/authentication/AUTH-101-user-login.spec.ts
import { test, expect } from "../../fixtures/test-fixtures";
import * as factories from "../../../src/testdata/factories";
import { load } from "../../../src/utils/dataStore";

test.describe.serial("AUTH-101 - User Login @authentication", () => {
  test("[AUTH-10001] Verify user can login with valid credentials", async ({ authenticationPage }) => {
    await factories.createUser().save("authentication.user");
    const user = await load("authentication.user");
    if (!user) {
      throw new Error("User data not found in data store.");
    }

    await test.step("Navigate to User Login", async () => {
      await authenticationPage.navigateToAuthentication();
    });

    await test.step("Enter credentials", async () => {
      const email = user.email;
      const password = user.password;
      await authenticationPage.fillEmail(email);
      await authenticationPage.fillPassword(password);
    });

    await test.step("Submit login form", async () => {
      await authenticationPage.submit();
    });

    await test.step("Verify successful login", async () => {
      await expect(authenticationPage.page).toHaveURL(/dashboard/);
    });
  });
});
```

**Important:** Replace the test case IDs (`[AUTH-10001]`, `[AUTH-10002]`) with your actual Azure DevOps test case IDs.

### Step 6: Create Test Data Factories (if needed)

If your tests need custom data models:

```bash
npm run pilot add:factory "User"
```

Follow the prompts to define your model fields and faker methods.

### Step 7: Run Tests

```bash
# Run all tests
npm test

# Run tests for a specific feature
npm test -- --grep @authentication
```

### Step 8: Sync to Azure DevOps

After tests pass, sync results to Azure DevOps:

```bash
# Manual sync
npm run sync:ado

# Or enable auto-sync in .env: ADO_AUTO_SYNC=true
```

### Next Steps

Once your first feature is working:

1. **Add more suites** to existing features:

   ```bash
   npm run pilot add:suite --feature "authentication"
   ```

2. **Create additional features** as needed:

   ```bash
   npm run pilot add:feature "User Management"
   ```

3. **Create shared page objects**:

   ```bash
   npm run pilot add:page "Dashboard" --feature "shared"
   ```

4. **Run health checks** periodically:
   ```bash
   npm run pilot attendant
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
npm test -- tests/authentication/AUTH-101-user-authentication.spec.ts

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

The `pilot` CLI tool automates framework scaffolding and maintenance, ensuring consistent wiring across the codebase. All commands are designed to work with Azure DevOps test plans, suites, and test cases.

### CLI Command Semantics

Understanding what each command means conceptually:

**`add:feature`** - Bootstraps a new feature (ADO test plan)

- Collects Azure DevOps Plan ID and initial suites
- Creates feature entry in `featureConfig.json`
- Creates `tests/<featureKey>/` directory
- Creates one spec file per suite entered
- Creates or reuses a page object for the feature
- **Intended for:** Initial feature setup when starting a new test plan

**`add:suite`** - Adds a new suite to an existing feature

- Prompts for suite name and Azure DevOps Suite ID
- Creates exactly one spec file
- Auto-increments numbering per feature (101, 102, 103, etc.)
- Adds suite entry to `featureConfig.json`
- **Intended for:** Day-to-day work when adding new test suites
- **Note:** `add:spec` is a legacy alias for `add:suite`

**`delete:suite`** - Deletes a suite from a feature

- Removes the spec file
- Removes the suite entry from `featureConfig.json`
- Requires typed confirmation (suite name, case-sensitive)
- Warns if it's the last suite in the feature
- **Intended for:** Removing individual suites
- **Note:** `delete:spec` is a legacy alias for `delete:suite`

**`delete:feature`** - Sweeping and destructive by design

- Removes feature config entry
- Removes all suites and spec files
- Removes pages owned by the feature (unless referenced elsewhere)
- Removes fixture wiring for deleted pages
- **Intended for:** Rare cleanup operations
- **Safety net:** Git version control

**`add:page` / `delete:page`** - Global page object management

- Pages are global fixtures (usable across all features)
- Fixtures are centrally wired in `tests/fixtures/test-fixtures.ts`
- Deletion is blocked if the page is referenced by any spec file
- **Intended for:** Creating reusable page objects or cleaning up unused ones

**`add:factory` / `delete:factory`** - Test data factory management

- Factories use faker for data generation
- Factories integrate with dataStore for persistence
- Deletion is blocked if the factory is referenced by any spec file
- **Intended for:** Creating test data builders with type safety

**`attendant`** - Read-only health checks

- Validates framework structure and wiring
- Checks for orphaned fixtures, stale exports, missing imports
- No destructive actions
- **Intended for:** CI/CD validation or periodic maintenance checks

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

Features define ADO mapping, tags, and test folder scaffolding. **You must have your ADO test plan and suites created before running this command.**

**Prerequisites:**

- Test plan created in Azure DevOps
- Test suites created in ADO (keep them small and focused!)
- Test plan ID and suite IDs/names ready

```bash
# Create a feature (will prompt for planId and suites)
npm run pilot add:feature "User Management"

# Or provide plan ID via flag (still prompts for suites)
npm run pilot add:feature "User Management" --plan-id 105
```

**Feature Creation Flow:**

1. Normalizes the feature name to a safe kebab-case key (e.g., "User Management" → "user-management")
2. Prompts for Azure DevOps Plan ID if not provided via `--plan-id`
3. Prompts for suite names first (what you named your test suites in ADO)
4. Then prompts for each suite's corresponding Azure DevOps Suite ID
5. Checks for existing pages matching the feature name
   - If found: asks if you want to reuse them
   - If not found: automatically creates a page using the feature name
6. Creates a spec file for **each suite** you entered
7. Adds the feature configuration to `featureConfig.json`

**Example Interactive Flow:**

```
Enter Azure DevOps Plan ID: 105
Enter suite name: User Login
Enter Azure DevOps Suite ID for "User Login": 5001
Enter suite name: User Registration
Enter Azure DevOps Suite ID for "User Registration": 5002
Enter suite name: (press Enter to finish)

Found existing page object: user-management. Use as primary page object? (Y/n) y
```

**What Gets Created:**

- Feature entry in `src/testdata/featureConfig.json`:
  ```json
  {
    "user-management": {
      "tag": "@user-management",
      "planId": 105,
      "suites": {
        "5001": "User Login",
        "5002": "User Registration"
      }
    }
  }
  ```
- Test directory: `tests/user-management/`
- Suite files: One spec file per suite (e.g., `USER-101-user-login.spec.ts`, `USER-102-user-registration.spec.ts`)
- Page object: `src/pages/user-management/UserManagementPage.ts` (if matching page exists, prompts to reuse it; if declined or not found, prompts for new name or auto-creates using feature name, and wires it into `test-fixtures.ts`)

**Example Output:**

```
  Normalized feature name: "User Management" → "user-management"
✓ Created feature: user-management
✓ Added to featureConfig.json
✓ Created test directory: tests/user-management
✓ Created suite: USER-101-user-login.spec.ts
✓ Created suite: USER-102-user-registration.spec.ts
✓ Created page: src/pages/user-management/UserManagementPage.ts
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

### Creating Suites

Add new suites to existing features. **You must have the suite created in ADO first.** This is the primary day-to-day command for adding test suites.

```bash
# Create a suite (will prompt for feature and suite info)
npm run pilot add:suite

# Or specify the feature
npm run pilot add:suite --feature "user-management"
```

**Note:** `add:spec` is a legacy alias for `add:suite`. Both commands do the same thing.

**Suite Creation Flow:**

1. Prompts for feature selection (dropdown if not provided)
2. Prompts for suite name (as it appears in ADO)
3. Validates no duplicate suite names within the feature (re-prompts if duplicate found)
4. Prompts for Azure DevOps Suite ID
5. Validates no duplicate suite IDs within the feature (re-prompts if duplicate found)
6. Only after validation passes: adds the suite to `featureConfig.json`
7. Creates the spec file with auto-incrementing ID (e.g., `USER-103-password-reset.spec.ts`)

**Note:** The CLI will not add duplicate suite names or IDs. If you enter a duplicate, it will re-prompt you to enter a different name/ID until you provide a unique one.

**If Feature Doesn't Exist (when using `--feature` flag):**

- If you use `--feature <feature-name>` and the feature already exists, the CLI will continue with suite creation normally
- If the feature doesn't exist, the CLI will prompt you to create it using the suite information you've already entered
- This streamlines the workflow when creating new features with additional suites
- Note: If you use the dropdown (no flag), you can only select from existing features, so the create-feature flow won't trigger

**Suite Template Includes:**

- Required imports (`test-fixtures`, `factories`, `dataStore`)
- `test.describe.serial` with feature tag and suite name
- Header comment with:
  - Feature key and tag
  - ADO Plan ID
  - ADO Suite ID (for this specific suite)
- Example test steps using factories and dataStore
- Proper factory/save/load pattern matching existing suites
- Auto-generated test IDs

**Example Output:**

```
✓ Created suite: tests/user-management/USER-103-password-reset.spec.ts
✓ Added suite to feature config: 5003 - "Password Reset"
```

**Note:** Spec filenames use the format: `<PREFIX>-<NUMBER>-<suite-name>.spec.ts` where:

- `PREFIX` is the first 4 uppercase letters of the feature key (e.g., "USER" for "user-management")
- `NUMBER` auto-increments based on existing suites (101, 102, 103, etc.)
- `suite-name` is the normalized suite name in kebab-case

### Creating Factories

Data factories follow the existing pattern with faker and save methods.

```bash
# Create a factory
npm run pilot add:factory "Product"

# The command will:
# - Check if model exists (prompts to reuse or create new)
# - If new: prompts for model fields (name, type, faker method)
# - Creates src/testdata/models/product.ts
# - Updates src/testdata/models/index.ts (export + ModelMap)
# - Creates src/testdata/factories/product.factory.ts with faker methods
# - Adds export to src/testdata/factories/index.ts
# - Prints import string for use in tests
```

**Interactive Flow:**

1. **Model Check**: If a model with the same name exists, you'll be asked:

   - "Model 'Product' already exists. Use existing model?" (Yes/No)
   - If **Yes**: Parses existing model fields and creates factory
   - If **No**: Prompts for a new model name

2. **Field Prompting** (for new models):

   - Enter field name (e.g., "email", "price", "isActive")
   - Select field type: `string`, `number`, `boolean`, or `Date`
   - Faker method suggestion appears (e.g., "email" → `faker.internet.email()`)
   - Accept suggestion or enter custom faker method
   - Press Enter with empty field name to finish

3. **Automatic Updates**:
   - Model file created with all fields
   - `models/index.ts` updated (export + import + ModelMap entry)
   - Factory file created with proper faker methods
   - `factories/index.ts` updated with export

**Example Output:**

```
Normalized model name: "Product" → "product"

💡 Enter fields for Product model (press Enter with empty name to finish).

Enter field name: name
Select type for "name": string
Suggested faker method: faker.lorem.word()
  Use suggested? (Y/n) y
✓ Added field: name (string)

Enter field name: price
Select type for "price": number
Suggested faker method: faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })
  Use suggested? (Y/n) y
✓ Added field: price (number)

Enter field name (or press Enter to finish):

✓ Created factory: src/testdata/factories/product.factory.ts
✓ Created model: src/testdata/models/product.ts
✓ Updated models/index.ts
✓ Added export to src/testdata/factories/index.ts

📋 Import this in your test:
import * as factories from "../../../src/testdata/factories";
// Usage: const product = await factories.createProduct().save("test.product");
```

**Example Generated Model:**

```typescript
export interface Product {
  name: string;
  price: number;
}
```

**Example Generated Factory:**

```typescript
import { faker } from "@faker-js/faker";
import type * as models from "../models";
import { save } from "../../utils/dataStore";
import type { DataStoreMap } from "../../utils/dataStore";

export function createProduct(overrides?: Partial<models.Product>) {
  const product: models.Product = {
    name: faker.lorem.word(),
    price: faker.number.float({ min: 0, max: 1000, fractionDigits: 2 }),
    ...overrides,
  };

  return {
    ...product,
    async save<K extends keyof DataStoreMap>(key: K): Promise<models.Product> {
      await save(key, product as unknown as DataStoreMap[K]);
      return product;
    },
  };
}
```

**Faker Method Suggestions:**

The CLI intelligently suggests faker methods based on field name and type:

- **String fields**: `email` → `faker.internet.email()`, `phone` → `faker.phone.number()`, `id` → `faker.string.uuid()`
- **Number fields**: `id` → `faker.number.int({ min: 1, max: 1000 })`, `price` → `faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })`
- **Boolean fields**: → `faker.datatype.boolean()`
- **Date fields**: `createdAt` → `faker.date.recent()`, `birthDate` → `faker.date.past()`

You can always accept the suggestion or provide your own custom faker method.

### Deleting Resources

All delete operations require typed confirmation and check for references.

#### Delete Feature

```bash
# Delete a feature (removes test folder, config entry, and associated pages if not referenced elsewhere)
npm run pilot delete:feature "user-management"

# You must type exactly: "delete user-management"
```

**Safety Checks:**

- Requires typed confirmation matching the feature key
- Deletes test directory and featureConfig.json entry
- **Deletes page objects associated with the feature ONLY if they are not referenced by other spec files**
- **Preserves pages that are referenced elsewhere** and warns about preserved pages
- Removes fixture wiring for deleted pages from `test-fixtures.ts`
- Deletes empty page directories

**Note:** Pages are global fixtures (usable across features) due to the fixture architecture. However, `delete:feature` performs a sweeping cleanup that removes pages "owned" by the feature if they are not referenced by other features. This ensures clean removal of feature-specific pages while preserving shared pages.

#### Delete Suite

```bash
# Delete a suite (dropdowns for feature and suite selection)
npm run pilot delete:suite

# Or specify feature and suite
npm run pilot delete:suite --feature "user-management" --suite "User Login"
```

**Note:** `delete:spec` is a legacy alias for `delete:suite`. Both commands do the same thing.

**What Gets Deleted:**

- Spec file from the feature's test directory
- Suite entry from `featureConfig.json` (removes the suite from the feature's suites object)

**Safety Checks:**

- Requires typed confirmation: `delete <Suite Name>` (case-sensitive, e.g., `delete User Login`)
- Warns if this was the last suite in the feature

#### Delete Page

```bash
# Delete a page (dropdown selection available)
npm run pilot delete:page

# Or specify the page name
npm run pilot delete:page "UserProfile"
```

**Safety Checks:**

- Blocks deletion if the page fixture is referenced in any `tests/**/*.spec.ts` files
- Requires typed confirmation: `delete page <normalized-name>` (e.g., `delete page user-profile`)
- Removes the page file and all fixture wiring from `test-fixtures.ts`
- Deletes empty page directories

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
- ⚠️ Warns about suite files missing required imports

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
   Suite "tests/user-management/USER-101-user-login.spec.ts": missing factories import

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
- **Validates feature existence** - Suite creation requires the feature to exist first (unless creating a new feature)

### Command Reference

| Command                 | Description                                                | Arguments                               | Options                                                          |
| ----------------------- | ---------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| `add:feature <name>`    | Create feature with config, test folder, and initial specs | `<name>` - Feature name                 | `--plan-id <id>` - ADO Plan ID                                   |
| `delete:feature [name]` | Delete feature (test folder and config)                    | `[name]` - Optional, prompts if omitted | -                                                                |
| `add:page [name]`       | Create page object and wire fixtures                       | `[name]` - Optional, prompts if omitted | `--feature <key>` - Feature key for directory                    |
| `delete:page [name]`    | Delete page and unwire fixtures                            | `[name]` - Optional, prompts if omitted | -                                                                |
| `add:suite`             | Create suite under existing feature                        | -                                       | `--feature <key>` - Feature key (prompts if omitted)             |
| `delete:suite`          | Delete suite and remove from feature config                | -                                       | `--feature <key>` - Feature key<br>`--suite <name>` - Suite name |
| `add:spec`              | Legacy alias for `add:suite`                               | -                                       | `--feature <key>` - Feature key (prompts if omitted)             |
| `delete:spec`           | Legacy alias for `delete:suite`                            | -                                       | `--feature <key>` - Feature key<br>`--suite <name>` - Suite name |
| `add:factory [name]`    | Create data factory and add export                         | `[name]` - Optional, prompts if omitted | -                                                                |
| `delete:factory [name]` | Delete factory and remove export                           | `[name]` - Optional, prompts if omitted | -                                                                |
| `attendant`             | Run health checks (read-only)                              | -                                       | -                                                                |
| `help`                  | Show help information                                      | -                                       | -                                                                |

**Note:** Commands with `[name]` in brackets will prompt for input if not provided, making the CLI more interactive and user-friendly.

## Writing Tests

### Basic Test Structure

All tests use the framework's fixture system. Import from `test-fixtures` and use injected page object fixtures:

```typescript
import { test, expect } from "../../fixtures/test-fixtures";
import * as factories from "../../../src/testdata/factories";
import { load } from "../../../src/utils/dataStore";

test.describe.serial("AUTH-101 - User Authentication @authentication", () => {
  test("[AUTH-10001] Verify user can login with valid credentials", async ({ loginPage }) => {
    await factories.createUser().save("authentication.user");
    const user = await load("authentication.user");
    if (!user) {
      throw new Error("User data not found in data store.");
    }

    await test.step("Navigate to login page", async () => {
      await loginPage.navigateToLogin();
    });

    await test.step("Enter credentials", async () => {
      const email = user.email;
      const password = user.password;
      await loginPage.fillEmail(email);
      await loginPage.fillPassword(password);
    });

    await test.step("Submit login form", async () => {
      await loginPage.submit();
    });

    await test.step("Verify successful login", async () => {
      await expect(loginPage.page).toHaveURL(/dashboard/);
    });
  });
});
```

### Using Test Data Factories

Factories are function-based and use the `.save()` pattern:

```typescript
import { test } from "../../fixtures/test-fixtures";
import * as factories from "../../../src/testdata/factories";
import { load } from "../../../src/utils/dataStore";

test.describe.serial("USER-101 - User Management @user-management", () => {
  test("[USER-10001] Create and use test data", async ({ userManagementPage }) => {
    await factories.createUser().save("user-management.user");
    const user = await load("user-management.user");
    if (!user) {
      throw new Error("User data not found in data store.");
    }

    await test.step("Navigate to user management", async () => {
      await userManagementPage.navigateToUserManagement();
    });

    await test.step("Use user data in test", async () => {
      const email = user.email;
      const password = user.password;
      await userManagementPage.fillEmail(email);
      await userManagementPage.fillPassword(password);
    });
  });
});
```

### Using Data Store

The data store provides cross-test data persistence:

```typescript
import { test } from "../../fixtures/test-fixtures";
import * as factories from "../../../src/testdata/factories";
import { load } from "../../../src/utils/dataStore";

test.describe.serial("APPT-101 - Appointments @appointments", () => {
  test("[APPT-10001] Use saved data across tests", async ({ appointmentPage }) => {
    await factories.createUser().save("appointments.user");
    await factories.createAppointment().save("appointments.appointment");
    const user = await load("appointments.user");
    const appointment = await load("appointments.appointment");

    if (!user || !appointment) {
      throw new Error("Required data not found in data store.");
    }

    await test.step("Navigate to appointments", async () => {
      await appointmentPage.navigateToAppointments();
    });

    await test.step("Use loaded data", async () => {
      const userEmail = user.email;
      const appointmentId = appointment.id;
      // Use user and appointment data in your test
    });
  });
});
```

## Page Objects

Page objects follow the CLI-generated template pattern with locator maps and consistent method naming:

```typescript
import type { Page } from "@playwright/test";

export class LoginPage {
  private locators = {
    container: '[data-testid="login-container"]',
    emailInput: '[data-testid="login-email-input"]',
    passwordInput: '[data-testid="login-password-input"]',
    submitButton: '[data-testid="login-submit-button"]',
  };

  constructor(private page: Page) {}

  // Navigates to the login page.
  async navigateToLogin() {
    await this.page.goto("/login");
    await this.page.locator(this.locators.container).waitFor({ timeout: 10000 });
  }

  // Fills the email input field.
  async fillEmail(email: string) {
    await this.page.locator(this.locators.emailInput).fill(email);
  }

  // Fills the password input field.
  async fillPassword(password: string) {
    await this.page.locator(this.locators.passwordInput).fill(password);
  }

  // Submits the login form.
  async submit() {
    await this.page.locator(this.locators.submitButton).click();
  }

  // Health check: verifies key elements are visible on the page.
  async healthCheck() {
    await this.page.locator(this.locators.container).waitFor({ timeout: 10000 });
    const isVisible = await this.page.locator(this.locators.container).isVisible();
    if (!isVisible) {
      throw new Error("LoginPage health check failed: container not visible");
    }
  }
}
```

**Key Patterns:**

- Locator map object with `data-testid` selectors
- `navigateTo<PageName>()` method for navigation (not `navigate()`)
- Action methods for page interactions
- `healthCheck()` method for verifying page state

## Test Data Factories

Factories are function-based with a `.save()` method pattern:

```typescript
import * as factories from "../../../src/testdata/factories";

// Create with defaults and save
const user = await factories.createUser().save("test.user");

// Create with custom values using overrides
const customUser = await factories
  .createUser({
    email: "custom@example.com",
    password: "custom123",
  })
  .save("test.custom-user");

// Load saved data
import { load } from "../../../src/utils/dataStore";
const saved = await load("test.user");
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
    "suites": {
      "7": "User Authentication"
    }
  }
}
```

- `tag` - The test tag used in Playwright tests (e.g., `@authentication`)
- `planId` - Azure DevOps test plan ID
- `suites` - Object mapping suite IDs (as strings) to suite names: `{ "<suiteId>": "<suiteName>" }`

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

Thank you for contributing to the Playwright Pilot automation framework! This section outlines the process for adding new tests and features to the framework.

### Workflow Overview

1. **Create tests in Azure DevOps first** - Always start by creating your test cases in ADO before writing automation code
2. **Create a feature branch** - Work in isolation on your changes
3. **Use the Pilot CLI** - Leverage the CLI to scaffold your tests and maintain consistency
4. **Commit and push** - Follow commit message conventions
5. **Create a Pull Request** - Submit your changes for review

### Step-by-Step Contribution Process

#### 1. Create Tests in Azure DevOps First

**Why start in ADO?**

- Ensures your test cases are documented and traceable
- Helps you think through test scenarios before coding
- Provides the ADO IDs you'll need for configuration
- Enables proper test management and reporting

**Best Practices for ADO Test Plans:**

- **Create focused test suites** - Keep suites small and focused on specific functionality
  - Example: Instead of one large "User Management" suite, create:
    - "User Login" (5-10 test cases)
    - "User Registration" (5-10 test cases)
    - "User Profile Update" (5-10 test cases)
- **Use descriptive suite names** - Names should clearly indicate what functionality is being tested
- **Organize by feature** - Group related suites under the same test plan
- **Keep test cases atomic** - Each test case should verify one specific behavior

**What you'll need from ADO:**

- **Test Plan ID** - The ID of your Azure DevOps test plan
- **Suite IDs and Names** - Each suite's ID and its display name
- **Test Case IDs** - The work item IDs for individual test cases (used in test titles like `[AUTH-9]`)

#### 2. Create a Feature Branch

```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/your-bug-description
```

**Branch Naming Conventions:**

- `feature/` - New features or test suites
- `fix/` - Bug fixes
- `refactor/` - Code improvements without changing functionality
- `docs/` - Documentation updates

#### 3. Use the Pilot CLI to Scaffold Your Tests

The Pilot CLI automates the creation of features, pages, specs, and factories, ensuring consistency across the codebase.

**Creating a New Feature:**

```bash
# Create a feature (will prompt for ADO information)
npm run pilot add:feature "User Management"

# Or provide ADO info via flags
npm run pilot add:feature "User Management" --plan-id 105
```

**During feature creation, you'll be prompted for:**

1. **Azure DevOps Plan ID** - The test plan ID from ADO
2. **Suite Names** - Enter the names of your test suites (as they appear in ADO)
3. **Suite IDs** - For each suite name, enter its corresponding ADO suite ID

**Example:**

```
Enter Azure DevOps Plan ID: 105
Enter suite name: User Login
Enter Azure DevOps Suite ID for "User Login": 5001
Enter suite name: User Registration
Enter Azure DevOps Suite ID for "User Registration": 5002
Enter suite name: (press Enter to finish)
```

The CLI will:

- Create the feature configuration in `src/testdata/featureConfig.json`
- Create the test directory structure (`tests/<featureKey>/`)
- Generate initial suite files (one spec file per suite)
- Create or reuse matching page objects

**Adding Additional Suites:**

If you need to add more suites to an existing feature:

```bash
# Add a new suite (will prompt for suite name and ID)
npm run pilot add:suite --feature "user-management"
```

**Creating Page Objects:**

```bash
# Create a page object
npm run pilot add:page "UserProfile"

# Or create under a specific feature
npm run pilot add:page "UserProfile" --feature "user-management"
```

**Creating Data Factories:**

```bash
# Create a test data factory
npm run pilot add:factory "Product"
```

#### 4. Configure ADO Information in Your Tests

**In Suite Files:**

Each suite file includes a header comment with ADO information. This is automatically generated by the CLI, but you should verify it matches your ADO configuration:

```typescript
// ---
// Tests for User Login Flow
// Feature: user-management
// Tag: @user-management
// ADO Plan ID: 105
// ADO Suite ID: 5001
// ---
```

**In Feature Configuration:**

The `src/testdata/featureConfig.json` file stores the mapping between features and ADO test plans:

```json
{
  "user-management": {
    "tag": "@user-management",
    "planId": 105,
    "suites": {
      "5001": "User Login",
      "5002": "User Registration"
    }
  }
}
```

**In Test Titles:**

Include the ADO test case ID in your test titles:

```typescript
test("[AUTH-10002] Verify user can login with valid credentials", async ({ authenticationPage }) => {
  // Test implementation using injected fixture
});
```

The format is: `[<TEST-CASE-ID>] <Test Description>`

**Note:** Always use injected page object fixtures (e.g., `{ authenticationPage }`), not `new PageObject(page)`.

**Where to Find ADO IDs:**

1. **Test Plan ID**:

   - Navigate to your test plan in Azure DevOps
   - The Plan ID appears in the URL: `.../testPlans/105/...`
   - Or view the test plan details page

2. **Suite ID**:

   - Open your test plan in ADO
   - Click on a suite to view its details
   - The Suite ID appears in the URL: `.../testPlans/105/suites/5001/...`
   - Or view the suite details page

3. **Test Case ID**:
   - Open a test case work item in ADO
   - The Test Case ID is the work item ID (e.g., `AUTH-9` or numeric ID)
   - Appears in the work item title or URL

#### 5. Write Your Tests

Follow the existing patterns in the codebase:

- **Use `test.describe.serial`** for tests that share state
- **Use `test.step()`** to organize test actions
- **Use page objects** for all page interactions
- **Use factories** for test data creation
- **Use data store** for sharing data across tests

**Example Test Structure:**

```typescript
import { test, expect } from "../../fixtures/test-fixtures";
import * as factories from "../../../src/testdata/factories";
import { load } from "../../../src/utils/dataStore";

test.describe.serial("USER-101 - User Login @user-management", () => {
  test("[USER-10001] Verify user can login with valid credentials", async ({ userManagementPage }) => {
    await factories.createUser().save("user-management.user");
    const user = await load("user-management.user");
    if (!user) {
      throw new Error("User data not found in data store.");
    }

    await test.step("Navigate to user management page", async () => {
      await userManagementPage.navigateToUserManagement();
    });

    await test.step("Use test data", async () => {
      const email = user.email;
      const password = user.password;
    });

    await test.step("Enter credentials", async () => {
      await userManagementPage.fillEmail(user.email);
      await userManagementPage.fillPassword(user.password);
    });

    await test.step("Submit login form", async () => {
      await userManagementPage.submit();
    });

    await test.step("Verify successful login", async () => {
      await expect(userManagementPage.page).toHaveURL(/dashboard/);
    });
  });
});
```

#### 6. Commit Your Changes

Follow conventional commit message format:

```bash
# Feature addition
git commit -m "feat: add user management test suite"

# Bug fix
git commit -m "fix: correct login page selector"

# Documentation
git commit -m "docs: update README with contribution guidelines"

# Refactoring
git commit -m "refactor: improve page object structure"
```

**Commit Message Format:**

- `feat:` - New feature or test suite
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Test-related changes
- `chore:` - Maintenance tasks

#### 7. Push and Create a Pull Request

```bash
# Push your branch
git push origin feature/your-feature-name
```

Then create a Pull Request with:

- **Clear title** describing what you're adding/fixing
- **Description** explaining:
  - What feature or tests you're adding
  - Which ADO test plan/suites this relates to
  - Any special considerations or dependencies
- **Screenshots** (if applicable) showing test results
- **Checklist** of what you've completed:
  - [ ] Tests created in ADO
  - [ ] Feature created using Pilot CLI
  - [ ] Suite files created with correct ADO IDs
  - [ ] Page objects created (if needed)
  - [ ] Tests passing locally
  - [ ] Code follows existing patterns

### ADO Information Checklist

Before submitting your PR, ensure you have:

- [ ] Created test plan in Azure DevOps
- [ ] Created test suites (small and focused)
- [ ] Created test cases in ADO
- [ ] Collected all required IDs:
  - [ ] Test Plan ID
  - [ ] Suite IDs and Names
  - [ ] Test Case IDs
- [ ] Updated `src/testdata/featureConfig.json` with feature configuration
- [ ] Added ADO information to suite file headers
- [ ] Included test case IDs in test titles
- [ ] Verified ADO sync works (if applicable)

### Code Quality Standards

- **TypeScript** - Use TypeScript for all new code
- **Type Safety** - Leverage TypeScript types, avoid `any`
- **Page Objects** - All page interactions must go through page objects
- **Test Data** - Use factories for test data creation
- **Naming** - Follow existing naming conventions (kebab-case for keys, PascalCase for classes)
- **Comments** - Add comments for non-obvious logic or requirements
- **DRY Principle** - Don't repeat yourself; extract common patterns

### Getting Help

- **CLI Help**: Run `npm run pilot -- --help` or `npm run pilot help`
- **Command-Specific Help**: Run `npm run pilot <command> -- --help`
- **Health Checks**: Run `npm run pilot attendant` to validate framework structure
- **Test the CLI**: Run `npm run test:cli` to see examples of CLI usage

### Review Process

Your PR will be reviewed for:

- Code quality and adherence to patterns
- Correct ADO configuration
- Test coverage and quality
- Documentation completeness
- Framework consistency

## License

See LICENSE file for details.
