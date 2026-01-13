# Builders: Test Data Generation with mimicry-js

Builders are private implementations using [mimicry-js](https://github.com/Stivooo/mimicry-js) that power test data generation. They live in `src/testdata/builders/` and are used internally by factories.

## Why Builders?

Builders provide a powerful, flexible way to generate test data with:

- **Default field generators** - Define how each field is created
- **Traits** - Optional variations (e.g., "admin", "sales")
- **Post-build hooks** - Ensure derived consistency
- **Toolbelt access** - Shared utilities for common patterns
- **Deterministic generation** - Seed support for reproducible tests

**Important:** Builders are **private** - tests should use factories, not builders directly.

## Architecture Roles

- **Models** (`src/testdata/models/`) - TypeScript interfaces (schema)
- **Builders** (`src/testdata/builders/`) - Private data generation logic (mimicry-js)
- **Factories** (`src/testdata/factories/`) - Public API for creating objects
- **dataStore** - State/persistence (system.* → canonical; test.* → runtime)

## Basic Builder Structure

When you create a factory via CLI, a builder is automatically created:

```typescript
// src/testdata/builders/user.builder.ts (private - used by factories only)
import { build } from "mimicry-js";
import type * as models from "../../testdata/models";
import { createTools } from "../../testdata/tools";

// Define the User model for the builder
interface UserModel {
  id: string;
  email: string;
  role: "admin" | "agent" | "viewer";
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  address: {
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
  };
}

// Create tools with idPrefix - tools are created per-builder to support per-test seeding
function getTools() {
  return createTools("user");
}

// Create the builder with default values
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
  traits: {
    // Optional traits (see below)
  },
  // Post-build hook: derive fullName from firstName and lastName
  postBuild: (user) => {
    user.fullName = `${user.firstName} ${user.lastName}`;
    return user;
  },
});

// Export builder methods for factory use
export function buildUser(overrides?: Partial<UserModel>): models.User {
  return userBuilder.one({ overrides });
}

export function buildUsers(count: number, overrides?: Partial<UserModel>): models.User[] {
  return userBuilder.many(count, { overrides });
}
```

## Using Builders: one() and many()

### Creating a Single Object

```typescript
// In factory
export function createUser(overrides?: Partial<models.User>) {
  return buildUser(overrides);
}
```

### Creating Multiple Objects

```typescript
// In factory (if needed)
export function createUsers(count: number, overrides?: Partial<models.User>) {
  return buildUsers(count, { overrides });
}
```

## Overrides

Factories support overrides to customize generated data:

```typescript
// In test
const user = factories.createUser({ email: "custom@example.com" });
```

The builder applies overrides after generating defaults:

```typescript
// Builder generates defaults, then applies overrides
const user = buildUser({ email: "custom@example.com" });
// Result: { id: "...", email: "custom@example.com", role: "admin", firstName: "...", ... }
```

## Traits

Traits provide named variations of your data. Define them in the builder:

```typescript
const userBuilder = build<UserModel>({
  fields: {
    id: () => getTools().id.short(),
    email: () => getTools().person.email(),
    role: () => getTools().pick.one(["admin", "agent", "viewer"]) || "admin",
    // ... other fields
  },
  traits: {
    admin: {
      overrides: {
        email: () => "admin@example.com",
        role: () => "admin" as const,
      },
    },
    agent: {
      overrides: {
        email: () => "agent@example.com",
        role: () => "agent" as const,
      },
    },
  },
});
```

Use traits when building:

```typescript
// In factory (if you want to expose traits)
export function createAdminUser(overrides?: Partial<models.User>) {
  return userBuilder.one({ traits: "admin", overrides });
}
```

Or use them directly in tests if factories expose them:

```typescript
// If factory exposes trait methods
const adminUser = factories.createAdminUser();
```

## Post-Build Hooks

Post-build hooks let you ensure derived consistency after generation:

```typescript
const userBuilder = build<UserModel>({
  fields: {
    id: () => getTools().id.short(),
    email: () => getTools().person.email(),
    firstName: () => getTools().person.firstName(),
    lastName: () => getTools().person.lastName(),
    fullName: () => "", // Set in postBuild
    // ... other fields
  },
  postBuild: (user) => {
    // Derive fullName from firstName and lastName
    user.fullName = `${user.firstName} ${user.lastName}`;
    return user;
  },
});
```

## Builder Toolbelt

The builder toolbelt is accessed via `createTools()` from `src/testdata/tools`. Each builder should create its own tools instance to support per-test deterministic seeding:

```typescript
import { createTools } from "../../testdata/tools";

function getTools() {
  return createTools("modelKey"); // idPrefix for short IDs
}
```

### pick - Selection Utilities

```typescript
const tools = createTools("model");

// Pick one random element
const status = tools.pick.one(["active", "inactive", "pending"]);

// Pick multiple elements
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

### person - Person Data (Non-Secret)

```typescript
const tools = createTools("model");

// Email (non-secret identifier)
const email = tools.person.email(); // "user123@example.com"
const customEmail = tools.person.email("custom-domain.com");

// Phone
const phone = tools.person.phone(); // "(555) 123-4567"

// Names
const firstName = tools.person.firstName();
const lastName = tools.person.lastName();
const fullName = tools.person.fullName();

// Address components
const street = tools.person.streetAddress(); // "123 Main St"
const city = tools.person.city();
const state = tools.person.state(); // "CA"
const zip = tools.person.zipCode(); // "12345"
const address = tools.person.address(); // Full address string
```

### date - Date Generation (Leap-Year Safe)

```typescript
const tools = createTools("model");

// Current date
const today = tools.date.today();

// Add days
const nextWeek = tools.date.addDays(today, 7);

// Next business day (skips weekends)
const nextBusiness = tools.date.nextBusinessDay(today);

// Date within a range
const appointmentDate = tools.date.range(
  new Date("2024-01-01"),
  new Date("2024-12-31")
);

// Specific appointment slot
const slot = tools.date.appointmentSlot(
  new Date("2024-03-15"),
  14, // 2 PM
  30  // 30 minutes
);
```

### id - ID Generation

```typescript
const tools = createTools("model");

// UUID
const id = tools.id.uuid(); // "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"

// Numeric ID
const numericId = tools.id.numeric(1, 999999); // Random number in range

// Short ID with factory-scoped prefix
const shortId = tools.id.short(); // "model_abc123" (if idPrefix="model")
const customShort = tools.id.short("prod"); // "prod_abc123"
```

### str - String Utilities

```typescript
const tools = createTools("model");

// Slugify text
const slug = tools.str.slug("User Profile Page"); // "user-profile-page"

// Title case
const title = tools.str.title("user profile"); // "User Profile"

// Random alphanumeric string
const random = tools.str.randomAlphaNumeric(8); // "aB3dEfGh"

// Mask string (e.g., for sensitive data)
const masked = tools.str.mask("1234567890", 4); // "1234******"
```

## Complete Example

Here's a complete builder example using the toolbelt:

```typescript
// src/testdata/builders/appointment.builder.ts
import { build } from "mimicry-js";
import type * as models from "../../testdata/models";
import { createTools } from "../../testdata/tools";

interface AppointmentModel {
  id: string;
  userId: string;
  date: Date;
  status: string;
  notes: string;
}

function getTools() {
  return createTools("appointment");
}

const appointmentBuilder = build<AppointmentModel>({
  fields: {
    id: () => getTools().id.short(),
    userId: () => getTools().id.uuid(), // Would typically come from another object
    date: () => getTools().date.addDays(getTools().date.today(), Math.floor(Math.random() * 30) + 1),
    status: () => getTools().pick.one(["scheduled", "confirmed", "completed", "cancelled"]) || "scheduled",
    notes: () => `Appointment notes ${getTools().str.randomAlphaNumeric(10)}`,
  },
  traits: {
    urgent: {
      overrides: {
        status: () => "scheduled",
        notes: () => "URGENT: High priority appointment",
      },
    },
    completed: {
      overrides: {
        status: () => "completed",
        date: () => getTools().date.addDays(getTools().date.today(), -Math.floor(Math.random() * 7) - 1),
      },
    },
  },
  postBuild: (appointment) => {
    // Ensure notes are consistent with status
    if (appointment.status === "completed" && !appointment.notes.includes("completed")) {
      appointment.notes = `Completed: ${appointment.notes}`;
    }
    return appointment;
  },
});

export function buildAppointment(overrides?: Partial<AppointmentModel>): models.Appointment {
  return appointmentBuilder.one({ overrides });
}

export function buildAppointments(count: number, overrides?: Partial<AppointmentModel>): models.Appointment[] {
  return appointmentBuilder.many(count, { overrides });
}

export const appointmentTraits = {
  urgent: "urgent" as const,
  completed: "completed" as const,
} as const;
```

## Best Practices

### Keep Builders Private

Builders are implementation details. Tests should use factories:

```typescript
// ✅ Good: Use factory
const user = factories.createUser();

// ❌ Avoid: Direct builder import in tests
import { buildUser } from "../../testdata/builders/user.builder";
const user = buildUser();
```

### Use Toolbelt for Common Patterns

Don't reinvent the wheel - use the toolbelt:

```typescript
// ✅ Good: Use toolbelt
date: () => getTools().date.addDays(getTools().date.today(), 7),

// ❌ Avoid: Manual date math
date: () => {
  const now = new Date();
  now.setDate(now.getDate() + Math.floor(Math.random() * 23) + 7);
  return now;
},
```

### Leverage Traits for Variations

Use traits for common variations instead of overrides:

```typescript
// ✅ Good: Define trait
traits: {
  admin: { overrides: { role: () => "admin" } },
}

// ❌ Avoid: Requiring overrides everywhere
const adminUser = factories.createUser({ role: "admin" }); // Works, but less clear
```

### Use Post-Build for Derived Consistency

Ensure derived fields are consistent:

```typescript
postBuild: (user) => {
  // Derive fullName from firstName and lastName
  user.fullName = `${user.firstName} ${user.lastName}`;
  return user;
},
```

## See Also

- [README.testdata.md](./README.testdata.md) - Complete test data system overview
- [README.cli.md](./README.cli.md) - CLI commands for creating factories/builders
- [mimicry-js GitHub](https://github.com/Stivooo/mimicry-js) - Full mimicry-js documentation
