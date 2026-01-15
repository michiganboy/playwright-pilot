# Test Data System

Playwright Pilot provides a comprehensive test data system with clear separation between canonical (repo-backed) and run-scoped persistence.

## Overview

The test data system consists of:

1. **Models** - TypeScript interfaces defining data structures
2. **Builders** - Private mimicry-js builders for data generation (used by factories)
3. **Factories** - Public API for creating test data objects
4. **dataStore** - Split storage for canonical (system.*) and run-scoped (test.*) data

## Two Types of Persistence

### Repo-Level Canonical Persistence (system.*)

**Storage:** `src/testdata/dataStore.json` (committed to repo)

**Registry:** `src/testdata/system.ts` (defines all system.* key strings)

**Characteristics:**
- Preconfigured, stable, assumed to exist before tests run
- Non-secrets only (emails, usernames). Secrets live in env/ADO
- Safe to assume exists. Should not be casually overwritten
- Tests NEVER write system data
- System entries are authored manually

**API:** `load(key)` - reads from `dataStore.json`, requires `system.*` key

**Access:** System values flow through fixtures (not direct imports)

### Run-Level Persistence (test.*)

**Storage:** `src/testdata/runState.json` (gitignored)

**Characteristics:**
- Shared across tests/specs during the SAME test run
- Cleared at the START of every run (via globalSetup) unless `PILOT_KEEP_RUNSTATE=true`
- Cleared at the END of every run (via globalTeardown) unless `PILOT_KEEP_RUNSTATE=true`
- Tests can write and read test data here
- Not guaranteed to exist long-term
- Must NOT dirty the repo
- **Note:** Located in `src/testdata/` (not `test-results/`) to avoid Playwright's output cleanup between runs, enabling cross-run persistence when needed

**PILOT_KEEP_RUNSTATE Environment Variable:**
- Default: `false` (runState is cleared at start and end of each run)
- When `PILOT_KEEP_RUNSTATE=true`: runState is preserved across separate test runs
- Use case: Multi-stage validation workflows (e.g., writer tests → collector test)
- Example: `PILOT_KEEP_RUNSTATE=true npm run test -- --grep="TOOLS-003-COLLECT"`

**API:** `set(key, value)` / `get(key)` - read/write `runState.json`, requires `test.*` keys

**Access:** Available as fixtures (`set`, `get`)

## API Mapping

| API | Namespace | Storage File | Committed? | Intended Usage | Type Safety |
|-----|-----------|--------------|------------|----------------|-------------|
| `load` | `system.*` only | `src/testdata/dataStore.json` | ✅ Yes | Canonical, system-owned data | Yes (via SystemKey type) |
| `set/get` | `test.*` only | `src/testdata/runState.json` | ❌ No | Test-owned, run-created data | No (manual type annotation) |

## Using set/get (test.* keys)

**Use `set/get` for test-owned, run-created data.** Available as fixtures.

### Setting Data

```typescript
test("Example test", async ({ set }) => {
  // Create and store test data (persists to src/testdata/runState.json)
  const user = factories.createUser();
  await set("test.user", user);

  // With overrides
  const adminUser = factories.createUser({ email: "admin@example.com" });
  await set("test.admin", adminUser);
});
```

### Getting Data

```typescript
test("Example test", async ({ get, page }) => {
  // Get test data (reads from src/testdata/runState.json)
  const user = await get<models.User>("test.user");
  if (!user) {
    throw new Error("User data not found");
  }

  // Use in test
  await page.fill('[data-testid="email"]', user.email);
  await page.fill('[data-testid="firstName"]', user.firstName);
  await page.fill('[data-testid="lastName"]', user.lastName);
});
```

### Complete Example

```typescript
import { test } from "../../fixtures/test-fixtures";
import * as factories from "../../../src/testdata/factories";
import type * as models from "../../../src/testdata/models";

test.describe.serial("USER-101 - User Management @user-management", () => {
  test("[10001] Create and use test data", async ({ page, userManagementPage, set, get }) => {
    // Create test data
    const user = factories.createUser();
    await set("test.user", user);

    // Get test data (can be accessed in later tests in the same run)
    const userData = await get<models.User>("test.user");
    if (!userData) {
      throw new Error("User data not found in data store.");
    }

    // Use in test
    await test.step("Navigate to user management", async () => {
      await userManagementPage.navigateToUserManagement();
    });

    await test.step("Use user data", async () => {
      await userManagementPage.fillEmail(userData.email);
      await userManagementPage.fillFirstName(userData.firstName);
      await userManagementPage.fillLastName(userData.lastName);
    });
  });

  test("[10002] Use data from previous test", async ({ page, get }) => {
    // This test can access data created in the previous test (same run)
    const userData = await get<models.User>("test.user");
    if (userData) {
      // Use the data...
    }
  });
});
```

## Using load (system.* keys)

**Use `load` for canonical, system-owned data.** System values are injected via fixtures.

### System Values via Fixtures

```typescript
test("Example test", async ({ page, systemValues }) => {
  // System values are pre-loaded and available
  const adminUser = systemValues["system.salesforce.users.admin"];
  
  // Use with environment variables for secrets
  const password = process.env.SALESFORCE_ADMIN_PASSWORD;
  
  // Use in test
  await page.fill('[data-testid="email"]', adminUser.email);
  await page.fill('[data-testid="password"]', password);
});
```

### System Registry

System keys are defined in `src/testdata/system.ts`:

```typescript
// src/testdata/system.ts
export const system = {
  salesforce: {
    users: {
      admin: "system.salesforce.users.admin",
      sales: "system.salesforce.users.sales",
    },
  },
} as const;
```

**Important:** Tests should not import `system` directly. System values flow through fixtures.

## API Enforcement

The dataStore **strictly enforces** namespace + API rules:

- `load()` **MUST only accept keys starting with "system."**
- `set/get()` **MUST only accept keys starting with "test."**
- Violations throw clear errors with guidance

**Example Errors:**

```typescript
// ❌ Error: load() can only be used with system.* keys. Received: "test.user". Use get() for test.* keys.
await load("test.user" as any);

// ❌ Error: set() can only be used with test.* keys. Received: "system.salesforce.users.admin". Use load() for system.* keys.
await set("system.salesforce.users.admin" as any, adminUser);
```

## Storage File Locations

### Canonical Store (system.* keys)

**Location:** `src/testdata/dataStore.json`

This file is:
- ✅ Committed to the repo
- ✅ Used by `load()` API only
- ✅ Contains canonical system data
- ✅ Updated manually (system entries are authored intentionally)

**Registry:** `src/testdata/system.ts`
- Defines all system.* key strings
- Only place where system keys are typed

### Run State (test.* keys)

**Location:** `src/testdata/runState.json`

**Why not in test-results/?** Playwright automatically cleans the `test-results/` directory between runs, which would wipe runState. By placing it in `src/testdata/`, we can preserve data across separate test runs when `PILOT_KEEP_RUNSTATE=true` is set.

This file is:
- ❌ Gitignored (never committed)
- ✅ Used by `set/get` API only
- ✅ Contains test-run data
- ✅ Created automatically on first write
- ✅ Cleared at start of each run (via globalSetup)
- ✅ Persists across tests/specs within the same run

## Seed and Run Metadata

Seed and run metadata are persisted to `test-results/.last-run.json` under a `pilot` namespace:

```json
{
  "status": "passed",
  "failedTests": [],
  "pilot": {
    "seed": "abc123def456",
    "seedMode": "generated",
    "startedAt": "2024-12-20T10:00:00.000Z",
    "finishedAt": "2024-12-20T10:05:00.000Z",
    "workers": 4
  }
}
```

**Seed Usage:**
- Set `PILOT_SEED` env var for deterministic runs
- Seed is printed in end-of-run summary
- Example: `To reproduce: PILOT_SEED=abc123def456 npm run test`
- Seed includes worker index to prevent cross-worker collisions
- Same test on same worker with same seed = identical data

## Creating Models, Builders, and Factories

### Using the CLI

```bash
# Create a factory (will create model and builder if they don't exist)
npm run pilot factory:add "Product"
```

The CLI will:
1. Check if model exists (prompts to reuse or create new)
2. Create model file with placeholder interface
3. Create builder file with mimicry-js setup and toolbelt imports
4. Create factory file that uses the builder
5. Update barrel exports

**Important:** After creation, you must:
- Manually add fields to the model interface
- Manually add field generators to the builder (using tools)
- Optionally add traits and post-build hooks

See [README.tools.md](./README.tools.md) for tools usage and [README.builders.md](./README.builders.md) for builder patterns.

## Examples

### Creating and Using Test Data

```typescript
import { test } from "../../fixtures/test-fixtures";
import * as factories from "../../../src/testdata/factories";
import type * as models from "../../../src/testdata/models";

test.describe.serial("APPT-101 - Appointments @appointments", () => {
  test("[10001] Create appointment with user data", async ({ page, appointmentPage, set, get }) => {
    // Create user (test-owned data)
    const user = factories.createUser();
    await set("test.user", user);

    // Create appointment (test-owned data)
    const appointment = factories.createAppointment({ userId: user.id });
    await set("test.appointment", appointment);

    // Get data (reads from runState.json)
    const userData = await get<models.User>("test.user");
    const appointmentData = await get<models.Appointment>("test.appointment");

    if (!userData || !appointmentData) {
      throw new Error("Required data not found");
    }

    // Use in test
    await appointmentPage.navigateToAppointments();
    await appointmentPage.createAppointment(appointmentData);
  });
});
```

### Using System Values

```typescript
test("Login with system user", async ({ page, autoPilot, systemValues }) => {
  // System values are pre-loaded via fixtures
  const adminUser = systemValues["system.salesforce.users.admin"] as { email: string };
  
  // Use with environment variables for secrets
  const password = process.env.SALESFORCE_ADMIN_PASSWORD;
  
  // Login using AutoPilot
  await autoPilot.login(adminUser.email, password);
});
```

## Summary: Choosing the Right API

**Quick Decision Guide:**

- **Test-owned data that can be freely overwritten?** → Use `set/get` with `test.*` keys (runState.json)
- **Canonical system data that needs type safety?** → Use system values via fixtures (dataStore.json)

**Key Takeaway:**
Two separate storage files with different purposes:
1. **system.***: Canonical, repo-backed, authored intentionally
2. **test.***: Run-scoped, persisted for a run, cleared each run

**Not based on:**
- ❌ Whether data persists (both do, but to different files)
- ❌ The key namespace alone (namespace determines storage target and API)

## See Also

- [README.md](./README.md) - Main documentation and bootstrap guide
- [README.tools.md](./README.tools.md) - Factory tools usage
- [README.builders.md](./README.builders.md) - Builder usage with mimicry-js
- [README.cli.md](./README.cli.md) - CLI command reference (factory/system creation)
