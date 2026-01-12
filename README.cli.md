# CLI Command Reference

The Playwright Pilot CLI uses a **resource:verb** naming convention for all commands. This makes it clear what resource you're operating on and what action you're performing.

## Command Naming Convention

All commands follow the pattern: `<resource>:<verb>`

Examples:

- `feature:add` - Add a feature
- `page:add` - Add a page object
- `spec:add` - Add a spec (legacy alias for `suite:add`)
- `factory:add` - Add a factory
- `trace:open` - Open trace report

## Supported Commands

| Command                 | Description                                                | Arguments                                    | Options                                                          |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `feature:add [name]`    | Create feature with config, test folder, and initial specs | `[name]` - Feature name (prompts if omitted) | `--plan-id <id>` - ADO Plan ID                                   |
| `feature:delete [name]` | Delete feature (test folder and config)                    | `[name]` - Feature name (prompts if omitted) | -                                                                |
| `page:add [name]`       | Create page object and wire fixtures                       | `[name]` - Page name (prompts if omitted)    | `--feature <key>` - Feature key for directory                    |
| `page:delete [name]`    | Delete page and unwire fixtures                            | `[name]` - Page name (prompts if omitted)    | -                                                                |
| `suite:add`             | Create suite under existing feature                        | -                                            | `--feature <key>` - Feature key (prompts if omitted)             |
| `suite:delete`          | Delete suite and remove from feature config                | -                                            | `--feature <key>` - Feature key<br>`--suite <name>` - Suite name |
| `spec:add`              | Legacy alias for `suite:add`                               | -                                            | `--feature <key>` - Feature key                                  |
| `spec:delete`           | Legacy alias for `suite:delete`                            | -                                            | `--feature <key>` - Feature key<br>`--suite <name>` - Suite name |
| `factory:add [name]`    | Create data factory and add export                         | `[name]` - Model name (prompts if omitted)   | -                                                                |
| `factory:delete [name]` | Delete factory and remove export                           | `[name]` - Factory name (prompts if omitted) | -                                                                |
| `trace:open`            | Open Playwright HTML report in browser                     | -                                            | -                                                                |
| `attendant`             | Run health checks (read-only)                              | -                                            | -                                                                |
| `help`                  | Show help information                                      | -                                            | -                                                                |

## Interactive Mode

Most CLI commands support **interactive mode** when arguments are omitted. To run a command interactively, simply omit the arguments and options:

```bash
# Interactive mode - will prompt for all required information
npm run pilot feature:add
npm run pilot page:add
npm run pilot suite:add
npm run pilot factory:add

# With arguments/flags - skips prompts for provided values
npm run pilot feature:add "User Management" --plan-id 105
npm run pilot page:add "UserProfile" --feature "user-management"
npm run pilot suite:add --feature "user-management"
```

**Key Points:**

- **Omit arguments** to run interactively - the CLI will prompt for all required information
- **Provide arguments/flags** to skip prompts for those specific values
- Commands with `[name]` in brackets will prompt if the name is not provided
- Options like `--feature` or `--plan-id` are optional; if omitted, the CLI will prompt

## Getting Help

```bash
# Show general help
npm run pilot -- --help
# or
npm run pilot help

# Show help for a specific command
npm run pilot feature:add -- --help
```

## Creating Features

Features define ADO mapping, tags, and test folder scaffolding. **You must have your ADO test plan and suites created before running this command.**

**Prerequisites:**

- Test plan created in Azure DevOps
- Test suites created in ADO (keep them small and focused!)
- Test plan ID and suite IDs/names ready

```bash
# Create a feature (will prompt for planId and suites)
npm run pilot feature:add "User Management"

# Or provide plan ID via flag (still prompts for suites)
npm run pilot feature:add "User Management" --plan-id 105
```

**Feature Creation Flow:**

1. Normalizes the feature name to a safe kebab-case key (e.g., "User Management" → "user-management")
2. **Validates feature key is unique** - Checks if a feature with the normalized key already exists in `featureConfig.json`
   - If it exists: Prompts "Feature already exists. Reuse existing feature?" (Yes/No)
   - If **No**: Command exits
   - If **Yes**: Re-prompts for feature name
3. **Validates test directory doesn't exist** - Checks if the test directory `tests/<featureKey>/` already exists
   - If it exists: Prompts "Test directory already exists. Reuse existing directory?" (Yes/No)
   - If **No**: Command exits
   - If **Yes**: Re-prompts for feature name
4. Prompts for Azure DevOps Plan ID if not provided via `--plan-id`
   - **Validates plan ID is unique** - If another feature already uses this plan ID, prompts "Plan ID is already used by feature '<featureName>'. Reuse this plan ID?" (Yes/No)
   - If **No**: Re-prompts for a different plan ID
   - If **Yes**: Re-prompts for plan ID
5. Prompts for suite names first (what you named your test suites in ADO)
   - **Validates suite names are unique within the feature** - If you enter a duplicate suite name (case-insensitive), prompts "Suite name already exists. Reuse existing suite?" (Yes/No)
   - If **No**: Re-prompts for a different suite name
   - If **Yes**: Re-prompts for suite name
6. Then prompts for each suite's corresponding Azure DevOps Suite ID
   - **Validates suite IDs are unique within the feature** - If you enter a duplicate suite ID, prompts "Suite ID already exists. Reuse existing suite ID?" (Yes/No)
   - If **No**: Re-prompts for a different suite ID
   - If **Yes**: Re-prompts for suite ID
7. Checks for existing pages matching the feature name
   - If found: asks if you want to reuse them
   - If not found: automatically creates a page using the feature name
8. Creates a spec file for **each suite** you entered
9. Adds the feature configuration to `featureConfig.json`

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

- Feature entry in `src/testdata/featureConfig.json`
- Test directory: `tests/user-management/`
- Suite files: One spec file per suite (e.g., `USER-101-user-login.spec.ts`, `USER-102-user-registration.spec.ts`)
- Page object: `src/pages/user-management/UserManagementPage.ts` (if matching page exists, prompts to reuse it; if declined or not found, auto-creates using feature name, and wires it into `test-fixtures.ts`)

## Creating Pages

Pages can be created independently or as part of feature creation.

```bash
# Create a page (uses page name as feature key for directory)
npm run pilot page:add "UserProfile"

# Create a page under a specific feature
npm run pilot page:add "UserProfile" --feature "user-management"
```

**What Gets Created:**

- Page file: `src/pages/<featureKey>/<PageName>Page.ts`
- Automatic fixture wiring in `tests/fixtures/test-fixtures.ts`:
  - Import statement
  - Entry to `Fixtures` type
  - Entry to `base.extend`

**Page Template Includes:**

- Placeholder locators with `data-testid` selectors
- Example methods (`navigateTo<PageName>`, actions)
- Health check method for verifying key elements
- **For Login pages only**: Stubbed `toLoginPilot()` adapter method (see [README.login.md](./README.login.md))

**Example Output:**

```
Normalized page name: "UserProfile" → "user-profile"
✓ Created page: src/pages/user-profile/UserProfilePage.ts
✓ Wired fixture: userProfilePage
```

## Creating Suites

Add new suites to existing features. **You must have the suite created in ADO first.** This is the primary day-to-day command for adding test suites.

```bash
# Create a suite (will prompt for feature and suite info)
npm run pilot suite:add

# Or specify the feature
npm run pilot suite:add --feature "user-management"
```

**Note:** `spec:add` is a legacy alias for `suite:add`. Both commands do the same thing.

**Suite Creation Flow:**

1. Prompts for feature selection (dropdown if not provided)
2. Prompts for suite name (as it appears in ADO)
3. Validates no duplicate suite names within the feature (re-prompts if duplicate found)
4. Prompts for Azure DevOps Suite ID
5. Validates no duplicate suite IDs within the feature (re-prompts if duplicate found)
6. Only after validation passes: adds the suite to `featureConfig.json`
7. Creates the spec file with auto-incrementing ID (e.g., `USER-103-password-reset.spec.ts`)

**If Feature Doesn't Exist (when using `--feature` flag):**

- If you use `--feature <feature-name>` and the feature already exists, the CLI will continue with suite creation normally
- If the feature doesn't exist, the CLI will prompt you to create it using the suite information you've already entered
- This streamlines the workflow when creating new features with additional suites

**Suite Template Includes:**

- Required imports (`test-fixtures`, `factories`, `dataStore`)
- `test.describe.serial` with feature tag and suite name
- Header comment with:
  - Feature key and tag
  - ADO Plan ID
  - ADO Suite ID (for this specific suite)
- Example test using `set/get` pattern with factories
- Proper factory usage matching current patterns

**Example Output:**

```
✓ Created suite: tests/user-management/USER-103-password-reset.spec.ts
✓ Added suite to feature config: 5003 - "Password Reset"
```

**Note:** Spec filenames use the format: `<PREFIX>-<NUMBER>-<suite-name>.spec.ts` where:

- `PREFIX` is the first 4 uppercase letters of the feature key (e.g., "USER" for "user-management")
- `NUMBER` auto-increments based on existing suites (101, 102, 103, etc.)
- `suite-name` is the normalized suite name in kebab-case

## Creating Factories

Data factories follow the existing pattern. **Models must exist before factories can be created.**

```bash
# Create a factory
npm run pilot factory:add "Product"
```

**Interactive Flow:**

1. **Factory Name Validation**: If a factory with the same name exists, you'll be asked:

   - "Factory 'Product' already exists. Use existing factory?" (Yes/No)
   - If **Yes**: No new factory created, exits
   - If **No**: Prompts for new factory name

2. **Model Check**: If a model with the same name exists, you'll be asked:

   - "Model 'Product' already exists. Reuse model?" (Yes/No)
   - If **Yes**: Uses existing model, creates factory
   - If **No**: Prompts for new model name

3. **Model Creation** (if new model needed):

   - Model file created with placeholder interface
   - `models/index.ts` updated (export + ModelMap entry)

4. **Factory Creation**:
   - Factory file created with simple factory function
   - `factories/index.ts` updated with export

**Important Notes:**

- **No field prompting**: Models are created with placeholder interfaces. You must manually add fields.
- **No faker inference**: Factories are created with basic structure. You must manually add faker methods.
- **No persistence methods**: Factories do not include `.save()` methods. Use `set/get` from dataStore instead.

**Example Generated Model:**

```typescript
// src/testdata/models/product.ts
export interface Product {
  // TODO: Add fields here
}
```

**Example Generated Factory:**

```typescript
// src/testdata/factories/product.factory.ts
import type * as models from "../models";

export function createProduct(overrides?: Partial<models.Product>) {
  const product: models.Product = {
    ...overrides,
  } as models.Product;

  return product;
}
```

**Example Output:**

```
Normalized model name: "Product" → "product"
✓ Factory "Product" created and associated to model "Product"

📋 Usage example:

  const product = factories.createProduct();
  await set("test.product", product);
  const productData = await get("test.product");

  test("Example test", async ({ page }) => {
    const id = productData.id;
    const email = productData.email;
    // Use productData in your test
  });
```

## Deleting Resources

All delete operations require typed confirmation and check for references.

### Delete Feature

```bash
# Delete a feature (removes test folder, config entry, and associated pages if not referenced elsewhere)
npm run pilot feature:delete "user-management"

# You must type exactly: "delete user-management"
```

**Safety Checks:**

- Requires typed confirmation matching the feature key
- Deletes test directory and featureConfig.json entry
- **Deletes page objects associated with the feature ONLY if they are not referenced by other spec files**
- **Preserves pages that are referenced elsewhere** and warns about preserved pages
- Removes fixture wiring for deleted pages from `test-fixtures.ts`
- Deletes empty page directories

### Delete Suite

```bash
# Delete a suite (dropdowns for feature and suite selection)
npm run pilot suite:delete

# Or specify feature and suite
npm run pilot suite:delete --feature "user-management" --suite "User Login"
```

**Note:** `spec:delete` is a legacy alias for `suite:delete`. Both commands do the same thing.

**What Gets Deleted:**

- Spec file from the feature's test directory
- Suite entry from `featureConfig.json` (removes the suite from the feature's suites object)

**Safety Checks:**

- Requires typed confirmation: `delete <Suite Name>` (case-sensitive, e.g., `delete User Login`)
- Warns if this was the last suite in the feature

### Delete Page

```bash
# Delete a page (dropdown selection available)
npm run pilot page:delete

# Or specify the page name
npm run pilot page:delete "UserProfile"
```

**Safety Checks:**

- Blocks deletion if the page fixture is referenced in any `tests/**/*.spec.ts` files
- Requires typed confirmation: `delete page <normalized-name>` (e.g., `delete page user-profile`)
- Removes the page file and all fixture wiring from `test-fixtures.ts`
- Deletes empty page directories

### Delete Factory

```bash
# Delete a factory (removes file and export)
npm run pilot factory:delete "Product"

# You must type exactly: "delete factory product"
```

**Safety Checks:**

- Blocks deletion if the factory function is referenced in any `tests/**/*.spec.ts` files
- Requires typed confirmation: `delete factory <normalized-name>`
- Removes the factory file and export from `factories/index.ts`

## Health Checks (Attendant)

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

## Opening Traces

The `trace:open` command opens the Playwright HTML report in your browser.

```bash
npm run pilot trace:open
```

This executes `npx playwright show-report` to open the most recent test report. See [README.artifacts.md](./README.artifacts.md) for more details on trace capture and viewing.

## Input Normalization

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

## Fail-Safes

The CLI follows conservative behavior:

- **Never overwrites existing files** - If a file exists, the command errors and stops
- **Checks references before deletion** - Blocks deletion if resources are in use
- **Requires typed confirmation** - Delete operations require exact confirmation text
- **Validates required inputs** - Prompts for missing required fields (planId, suites)
- **Validates feature existence** - Suite creation requires the feature to exist first (unless creating a new feature)

## Templates

CLI templates live under `src/cli/templates/`:

- `page.ts` - Page object template
- `spec.ts` - Suite/spec file template
- `factory.ts` - Factory template
- `model.ts` - Model template

Examples in this documentation match the current templates. If you need to customize templates, edit them directly, but be aware that CLI updates may overwrite your changes.

## See Also

- [README.md](./README.md) - Main documentation and bootstrap guide
- [README.ado.md](./README.ado.md) - Azure DevOps mapping philosophy
- [README.testdata.md](./README.testdata.md) - Test data system details
- [README.login.md](./README.login.md) - AutoPilot and LoginPilot architecture
- [README.artifacts.md](./README.artifacts.md) - Trace and attachment details
