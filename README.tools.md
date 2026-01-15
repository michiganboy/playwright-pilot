# Factory Tools

Factory tools provide default utilities for test data generation. Each factory receives a `tools` object with these utilities, powered by mimicry-js with deterministic per-test seeding.

## Purpose & Scope

Tools are designed for generating test data values only. They do not include UI/Playwright helpers (those belong in `src/utils/ui/`). Tools provide:

- Deterministic generation (A2 seeding strategy)
- Common patterns (pick, person, date, id, string utilities)
- Post-build and override utilities

## Determinism Model (A2)

Each test run uses a single run-level seed (`PILOT_SEED`):

- If `PILOT_SEED` env var is set: uses that seed (forced mode)
- If not set: generates one seed per run (generated mode)

Each test derives a stable test seed from: `hash(PILOT_SEED + test identifier + workerIndex)`

This ensures:
- Same test always generates same data (for a given run seed + worker)
- Different tests generate different data
- Different workers generate different data (prevents cross-worker collisions)
- Reproducibility: With `PILOT_SEED=12345`, the same test on the same worker always produces identical data

**Multi-Worker Validation:**
The seed includes `workerIndex` to ensure different workers generate different data. This enables validation of cross-worker collision detection:
1. Run writer tests with multiple workers: `PILOT_SEED=12345 PILOT_KEEP_RUNSTATE=true npm run test -- --grep="TOOLS-003-WRITE" --workers=4`
2. Run collector test to verify no collisions: `PILOT_SEED=12345 PILOT_KEEP_RUNSTATE=true npm run test -- --grep="TOOLS-003-COLLECT" --workers=1`

Seed is persisted to `test-results/.last-run.json` under `pilot.seed`.

## Usage in Factories

Every factory receives a `tools` object:

```typescript
// src/testdata/builders/user.builder.ts
import { build } from "mimicry-js";
import { createTools } from "../../testdata/tools";
import type * as models from "../../testdata/models";

// Create tools with idPrefix - tools are created per-builder to support per-test seeding
function getTools() {
  return createTools("user"); // idPrefix for short IDs
}

const userBuilder = build<UserModel>({
  fields: {
    id: () => getTools().id.short(),
    email: () => getTools().person.email(),
    role: () => getTools().pick.one(["admin", "agent", "viewer"]) || "admin",
    firstName: () => getTools().person.firstName(),
    lastName: () => getTools().person.lastName(),
    fullName: () => "", // Set in postBuild
    phone: () => getTools().person.phone(),
    address: () => ({
      streetAddress: getTools().person.streetAddress(),
      city: getTools().person.city(),
      state: getTools().person.state(),
      zipCode: getTools().person.zipCode(),
    }),
  },
  postBuild: (user) => {
    user.fullName = `${user.firstName} ${user.lastName}`;
    return user;
  },
});
```

## Tools Categories

### pick

Selection utilities for arrays and enums.

```typescript
// Pick one random element
const status = tools.pick.one(["active", "inactive", "pending"]);

// Pick multiple elements (without replacement)
const tags = tools.pick.many(["tag1", "tag2", "tag3", "tag4"], 2);

// Pick with weights
const priority = tools.pick.weighted([
  { item: "low", weight: 5 },
  { item: "medium", weight: 3 },
  { item: "high", weight: 1 },
]);

// Pick enum value
enum Status { Active = "active", Inactive = "inactive" }
const status = tools.pick.enum(Status);
```

**Example Output:**
```json
{
  "status": "active",
  "tags": ["tag1", "tag3"],
  "priority": "low"
}
```

### person

Person-related generators (non-secret identifiers only).

```typescript
// Email (non-secret identifier)
const email = tools.person.email(); // "user123@example.com"
const customEmail = tools.person.email("custom-domain.com");

// Phone
const phone = tools.person.phone(); // "(555) 123-4567"

// Names
const firstName = tools.person.firstName();
const lastName = tools.person.lastName();
const fullName = tools.person.fullName();

// Address
const street = tools.person.streetAddress(); // "123 Main St"
const city = tools.person.city();
const state = tools.person.state(); // "CA"
const zip = tools.person.zipCode(); // "12345"
const address = tools.person.address(); // Full address string
```

**Example Output:**
```json
{
  "email": "alex.smith@example.com",
  "phone": "(555) 123-4567",
  "fullName": "Alex Smith",
  "address": "123 Main St, Springfield, CA 12345"
}
```

### date

Date generation (leap-year safe, business day aware, timezone aware).

```typescript
// Today
const today = tools.date.today();

// Add days (handles month/year boundaries)
const nextWeek = tools.date.addDays(today, 7);

// Next business day (skips weekends)
const nextBusiness = tools.date.nextBusinessDay(today);

// Random date in range
const appointmentDate = tools.date.range(
  new Date("2024-01-01"),
  new Date("2024-12-31")
);

// Appointment slot (specific hour/minute)
const slot = tools.date.appointmentSlot(
  new Date("2024-12-25"),
  14, // 2 PM
  30  // 30 minutes
);
```

**Example Output:**
```json
{
  "today": "2024-12-20T00:00:00.000Z",
  "nextWeek": "2024-12-27T00:00:00.000Z",
  "nextBusiness": "2024-12-23T00:00:00.000Z",
  "appointmentDate": "2024-06-15T00:00:00.000Z",
  "slot": "2024-12-25T14:30:00.000Z"
}
```

### id

ID generation utilities.

```typescript
// UUID
const id = tools.id.uuid(); // "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"

// Numeric ID
const numericId = tools.id.numeric(1, 999999); // Random number in range

// Short ID (uses factory idPrefix)
const shortId = tools.id.short(); // "user_abc123" (if idPrefix="user")
const customShort = tools.id.short("prod"); // "prod_abc123"
```

**Example Output:**
```json
{
  "uuid": "a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789",
  "numericId": 12345,
  "shortId": "user_abc123"
}
```

### str

String manipulation utilities.

```typescript
// Slug (URL-friendly)
const slug = tools.str.slug("User Profile Page"); // "user-profile-page"

// Title case
const title = tools.str.title("user profile"); // "User Profile"

// Random alphanumeric
const random = tools.str.randomAlphaNumeric(8); // "aB3dEfGh"

// Mask (hide sensitive data)
const masked = tools.str.mask("1234567890", 4); // "1234******"
```

**Example Output:**
```json
{
  "slug": "user-profile-page",
  "title": "User Profile",
  "random": "aB3dEfGh",
  "masked": "1234******"
}
```

### Post-Build and Override Utilities

Power tools for advanced factory usage.

```typescript
import { createTools } from "../testdata/tools";

// Create tools instance (done per-builder)
const tools = createTools("user");

// Post-build hook (runs after object is built)
const userBuilder = build<UserModel>({
  fields: { /* ... */ },
  postBuild: tools.after.build((user) => {
    // Ensure email matches firstName.lastName pattern
    if (!user.email.includes(user.firstName.toLowerCase())) {
      user.email = `${user.firstName.toLowerCase()}.${user.lastName.toLowerCase()}@example.com`;
    }
    return user;
  }),
});

// Override merge (deep merge) - typically used inside builders
// Example: Merging trait overrides with base fields
const base = { id: "1", name: "User", role: "member" };
const overrides = { role: "admin" };
const merged = tools.override.merge(base, overrides);
// Result: { id: "1", name: "User", role: "admin" }

// Override pick (single-field generator override) - typically used inside builders
// Example: Conditionally generating a field based on another field
const baseUser = { id: "1", email: "old@example.com", role: "member" };
const updatedUser = tools.override.pick(
  baseUser,
  "email",
  () => tools.person.email("admin.com")
);
// Result: baseUser with email replaced by generator result

// Note: These utilities are primarily for use inside builders, not in tests.
// Tests should use factory overrides directly: factories.createUser({ role: "admin" })
```

## Boundaries

**Tools do NOT include:**
- UI/Playwright helpers (use `src/utils/ui/` instead)
- Page object methods
- Browser interactions
- Test assertions

**Tools ARE for:**
- Generating test data values
- Deterministic randomness
- Common data patterns

## Relationship to Other Systems

- **Models**: Define data structure (interfaces)
- **Factories**: Use tools to generate model instances
- **Builders**: Private implementation using mimicry-js + tools
- **dataStore**: Stores generated data (system.* or test.*)
- **Fixtures**: Inject system values, provide set/get for test values

## See Also

- [README.testdata.md](./README.testdata.md) - Complete test data system
- [README.builders.md](./README.builders.md) - Builder usage with mimicry-js
- [README.cli.md](./README.cli.md) - CLI commands (factory creation)
