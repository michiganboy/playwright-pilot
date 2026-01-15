# Azure DevOps Mapping Philosophy

Playwright Pilot is designed around Azure DevOps Test Plans. The framework's structure directly mirrors ADO concepts to ensure traceability and alignment with how tests are managed by QA and stakeholders.

## Core Mapping

The framework maps ADO concepts to code structure:

| Azure DevOps   | Framework   | Implementation                               |
| -------------- | ----------- | -------------------------------------------- |
| **Test Plan**  | **Feature** | Defined in `src/testdata/featureConfig.json` |
| **Test Suite** | **Suite**   | One spec file per suite                      |
| **Test Case**  | **Test**    | Individual `test()` blocks                   |

### Feature ↔ ADO Test Plan

- **One feature maps to one Azure DevOps test plan**
- Features are defined in `src/testdata/featureConfig.json`
- Each feature has:
  - A unique tag (e.g., `@authentication`)
  - An Azure DevOps Plan ID
  - One or more suites

**Example Feature Configuration:**

```json
{
  "authentication": {
    "tag": "@authentication",
    "planId": 2,
    "suites": {
      "7": "User Authentication",
      "8": "Password Reset"
    }
  }
}
```

### Suite ↔ Azure DevOps Test Suite

- **One suite maps to one Azure DevOps test suite**
- **One suite is implemented as exactly one spec file**
- Suites are the **primary unit of work** in this framework
- Suites are defined under their feature in `featureConfig.json`
- Suites are implemented in Playwright using `test.describe.serial()`
- Spec filename format: `<PREFIX>-<NUMBER>-<suite-name>.spec.ts`
  - Example: `AUTH-101-user-authentication.spec.ts`

**Suite Structure:**

```typescript
// tests/authentication/AUTH-101-user-authentication.spec.ts
test.describe.serial("AUTH-101 - User Authentication @authentication", () => {
  // Test cases go here
});
```

### Test Case ↔ Azure DevOps Test Case

- **Each `test()` block represents one Azure DevOps test case**
- Test case IDs appear in test titles
- Format: `[<TEST-CASE-ID>] <Test Description>`
- Example: `[10001] User can log in with valid credentials`

**Test Structure:**

```typescript
test("[10001] User can log in with valid credentials", async ({ page, autoPilot }) => {
  // Test implementation
});
```

## Why This Structure Exists

This mapping provides:

1. **Traceability** - Every test maps directly to an ADO test case
2. **Reporting** - Test results sync cleanly to ADO with proper IDs
3. **Dashboards** - ADO dashboards reflect actual test coverage
4. **Management** - QA can manage tests in ADO without touching code
5. **Consistency** - Framework structure matches organizational test management

## Writing Tests: ADO ID Requirements

### Where ADO IDs Go

1. **Feature Configuration** (`src/testdata/featureConfig.json`):

   ```json
   {
     "authentication": {
       "tag": "@authentication",
       "planId": 2, // ← ADO Plan ID
       "suites": {
         "7": "User Authentication" // ← Suite ID: Suite Name
       }
     }
   }
   ```

2. **Suite Files** (header comment):

   ```typescript
   // ---
   // Tests for User Authentication
   // Feature: authentication
   // Tag: @authentication
   // ADO Plan ID: 2
   // ADO Suite ID: 7
   // ---
   ```

3. **Test Titles**:
   ```typescript
   test("[10001] User can log in with valid credentials", async ({ page }) => {
     // Test implementation
   });
   ```

### Describe Blocks Map to Suites

Each `test.describe.serial()` block represents one suite:

```typescript
// This describe block = Suite "User Authentication" (ADO Suite ID: 7)
test.describe.serial("AUTH-101 - User Authentication @authentication", () => {
  test("[10001] User can log in with valid credentials", async ({ page }) => {
    // Test case 1
  });

  test("[10002] User cannot log in with invalid password", async ({ page }) => {
    // Test case 2
  });
});
```

### What Is Required vs Optional

**Required:**

- ✅ Feature tag in `describe` block (e.g., `@authentication`)
- ✅ ADO Plan ID in `featureConfig.json`
- ✅ ADO Suite ID in `featureConfig.json`
- ✅ Test case ID in test title (e.g., `[10001]`)
- ✅ Suite name in `describe` block
- ✅ Test description in title (after the ID)

## Guidance for Engineers

### Creating a New Feature

1. **Create test plan in Azure DevOps first**
2. **Create test suites in ADO** (keep them small and focused!)
3. **Collect IDs:**
   - Test Plan ID (from ADO URL or test plan details)
   - Suite IDs and Names (from ADO suite details)
4. **Run CLI command:**
   ```bash
   npm run pilot feature:add "Authentication" --plan-id 2
   ```
5. **Verify `featureConfig.json`** was updated correctly

### Adding a New Suite

1. **Create test suite in Azure DevOps first**
2. **Collect Suite ID** (from ADO suite details)
3. **Run CLI command:**
   ```bash
   npm run pilot suite:add --feature "authentication"
   ```
4. **Verify suite was added to `featureConfig.json`**

### Writing Test Cases

1. **Create test case in Azure DevOps first**
2. **Get Test Case ID** (work item ID from ADO)
3. **Write test with ID in title:**
   ```typescript
   test("[10001] User can log in with valid credentials", async ({ page }) => {
     // Implementation
   });
   ```

### Finding ADO IDs

**Test Plan ID:**

- Navigate to your test plan in Azure DevOps
- The Plan ID appears in the URL: `.../testPlans/105/...`
- Or view the test plan details page

**Suite ID:**

- Open your test plan in ADO
- Click on a suite to view its details
- The Suite ID appears in the URL: `.../testPlans/105/suites/5001/...`
- Or view the suite details page

**Test Case ID:**

- Open a test case work item in ADO
- The Test Case ID is the work item ID (e.g., `AUTH-9` or numeric ID)
- Appears in the work item title or URL

## Test Results and Attachments

When tests run, results can be synced to Azure DevOps. The framework supports:

- **Test outcomes** (Passed/Failed/Skipped)
- **Duration**
- **Error messages**
- **Test steps**
- **Attachments** (traces, error context, metadata)

See [artifacts.md](./artifacts.md) for details on trace capture and attachment configuration.

## Sync to Azure DevOps

After tests run, sync results to ADO:

```bash
npm run sync:ado
```

Or enable auto-sync in `.env`:

```env
ADO_AUTO_SYNC=true
```

The sync process:

1. Reads Playwright test results
2. Matches tests to ADO test cases using IDs in titles
3. Updates test case results in ADO
4. Uploads attachments (if configured)

## Best Practices

1. **Create tests in ADO first** - Always start with ADO, then mirror in code
2. **Keep suites small** - 5-10 test cases per suite is ideal
3. **Use descriptive suite names** - Names should clearly indicate functionality
4. **Organize by feature** - Group related suites under the same test plan
5. **Keep test cases atomic** - Each test case should verify one specific behavior
6. **Always include test case IDs** - Required for proper traceability

## See Also

- [README.md](./README.md) - Main documentation and bootstrap guide
- [cli.md](./cli.md) - CLI command reference
- [artifacts.md](./artifacts.md) - Trace and attachment details
