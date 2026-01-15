# Mailosaur Integration

Mailosaur provides email and SMS testing capabilities for automated MFA flows. This integration is **invisible by default** - test authors simply log in with MFA users and the framework handles OTP retrieval automatically.

## Overview

When using Mailosaur MFA users, AutoPilot:

1. Submits username/password credentials
2. Detects MFA is required (via `user.mfa.provider === "mailosaur"`)
3. Resolves the appropriate channel (email or SMS)
4. Waits for OTP from Mailosaur
5. Submits the OTP code
6. Continues to the application

Test authors do not need to import or reference Mailosaur directly.

## Environment Variables

Configure these in your `.env` file or Azure DevOps pipeline variables:

| Variable               | Required | Description                                       |
| ---------------------- | -------- | ------------------------------------------------- |
| `MAILOSAUR_API_KEY`    | Yes      | Your Mailosaur API key (from Mailosaur dashboard) |
| `MAILOSAUR_SERVER_ID`  | Yes      | Your Mailosaur server ID                          |
| `MAILOSAUR_TIMEOUT_MS` | No       | Timeout for waiting for messages (default: 30000) |

### Example `.env`

```env
MAILOSAUR_API_KEY=your-api-key-here
MAILOSAUR_SERVER_ID=abc123de
MAILOSAUR_TIMEOUT_MS=30000
LOGIN_PASSWORD=your-shared-password
```

### Azure DevOps Variables

In your pipeline, set these as secret variables:

- `MAILOSAUR_API_KEY` - Mark as secret
- `MAILOSAUR_SERVER_ID`
- `LOGIN_PASSWORD` - Mark as secret

## Storage Model

| Data Type | Key Prefix | File Path                     | Git Status | Access Method   |
| --------- | ---------- | ----------------------------- | ---------- | --------------- |
| System    | `system.*` | `src/testdata/dataStore.json` | Committed  | `load()`        |
| Test/Run  | `test.*`   | `src/testdata/runState.json`  | Gitignored | `set()`/`get()` |

**System data:**

- Preconfigured, stable identities that exist before tests run
- Committed to the repository and shared across all environments
- Contains non-secrets only (emails, usernames, phone numbers)
- Accessed via `load("system.key.path")`
- Updated ONLY via CLI commands (`system:add`, `system:delete`) which call `updateSystemRegistry()` internally
- Tests MUST NOT write or modify system data

**Test/Run data:**

- Ephemeral data created during test execution
- Gitignored and cleared between test runs
- Accessed via `set("test.key", value)` and `get("test.key")`
- Managed per-test via fixtures

## Placeholder Substitution

System entries may contain the `<serverId>` placeholder in email addresses. When you call `load()`, the framework **automatically substitutes** this placeholder with the value of `MAILOSAUR_SERVER_ID` at runtime.

**How it works:**

- Store `"admin@<serverId>.mailosaur.net"` in `dataStore.json`
- At runtime, `load()` replaces it with `"admin@abc123.mailosaur.net"` (using your env var)
- The actual server ID is never hardcoded in the committed JSON

**Error handling:**

- If a loaded value contains `<serverId>` but `MAILOSAUR_SERVER_ID` is not set, `load()` throws a clear error
- If no placeholder is present, the env var is not required

This keeps `dataStore.json` environment-agnostic while still supporting Mailosaur email addresses.

## System User Examples

The following examples show the **shape** of system user entries as stored in `src/testdata/dataStore.json`. These are committed, stable identities - tests use them but do not create or modify them.

### Non-MFA User

```json
{
  "system.salesforce.users.admin": {
    "username": "admin@example.com",
    "email": "admin@example.com"
  }
}
```

### MFA User - Email Only

```json
{
  "system.salesforce.mfaUsers.adminA": {
    "username": "mfa-admin-a@example.com",
    "email": "mfa-admin-a@example.com",
    "mfa": {
      "provider": "mailosaur",
      "channels": {
        "email": {
          "sentTo": "mfa-admin-a@<serverId>.mailosaur.net"
        }
      }
    }
  }
}
```

### MFA User - SMS Only

```json
{
  "system.salesforce.mfaUsers.adminB": {
    "username": "mfa-admin-b@example.com",
    "email": "mfa-admin-b@example.com",
    "mfa": {
      "provider": "mailosaur",
      "channels": {
        "sms": {
          "sentTo": "+15551234567"
        }
      }
    }
  }
}
```

### MFA User - Both Channels with Default

```json
{
  "system.salesforce.mfaUsers.adminA": {
    "username": "mfa-admin-dual@example.com",
    "email": "mfa-admin-dual@example.com",
    "mfa": {
      "provider": "mailosaur",
      "channels": {
        "email": {
          "sentTo": "mfa-admin-dual@<serverId>.mailosaur.net"
        },
        "sms": {
          "sentTo": "+15551234567"
        }
      },
      "defaultChannel": "email"
    }
  }
}
```

## Test Examples

### AutoPilot Login (Invisible MFA)

```typescript
import { test } from "../fixtures/test-fixtures";
import { load } from "../../src/utils/dataStore";

test("[10001] Login with MFA user", async ({ autoPilot }) => {
  // Load the system user by key - MFA is handled automatically
  const user = await load("system.salesforce.mfaUsers.adminA");

  await test.step("Login to application", async () => {
    await autoPilot.login(user);
  });

  // Test continues after successful login...
});
```

### AutoPilot Login with Channel Override

```typescript
import { test } from "../fixtures/test-fixtures";
import { load } from "../../src/utils/dataStore";

test("[10002] Login with SMS MFA override", async ({ autoPilot }) => {
  const user = await load("system.salesforce.mfaUsers.adminA");

  await test.step("Login with SMS channel", async () => {
    // Force SMS channel even if user has email as default
    await autoPilot.login(user, { mfaChannel: "sms" });
  });
});
```

### Advanced: Manual OTP Usage

For specialized tests that need direct access to OTP codes:

```typescript
import { test, expect } from "../fixtures/test-fixtures";
import { load } from "../../src/utils/dataStore";

test("[10003] Verify OTP code format", async ({ otp }) => {
  const user = await load("system.salesforce.mfaUsers.adminA");

  // Trigger MFA flow in your app (manual steps)...

  // Wait for and retrieve OTP
  const result = await otp.waitForCode(user, { timeoutMs: 60000 });

  expect(result.code).toMatch(/^\d{6}$/);
  expect(result.receivedAt).toBeInstanceOf(Date);
});
```

### Advanced: Link Retrieval

For email verification links or password reset flows:

```typescript
import { test, expect } from "../fixtures/test-fixtures";

test("[10004] Retrieve verification link", async ({ links }) => {
  const recipient = "test-user@abc123.mailosaur.net";

  // Trigger email in your app...

  // Wait for link containing specific text
  const verifyLink = await links.waitForLink(recipient, {
    contains: "/verify",
    subjectContains: "Verify your email",
    timeoutMs: 30000,
  });

  expect(verifyLink).toContain("https://");
});
```

## Multi-Admin Usage

The `adminA` and `adminB` system keys represent **separate user identities**, not different channels of the same user.

- Use `adminA` for one admin account
- Use `adminB` for another admin account
- Channel selection (email/sms) is determined by the user's `mfa.channels` configuration, not by key names

This allows parallel test execution with distinct identities to avoid conflicts.

## Channel Selection Rules

1. **Override wins**: If `{ mfaChannel: "sms" }` is passed to `login()`, that channel is used (throws if not configured)
2. **Single channel**: If user has only one channel configured, it's used automatically
3. **Multiple channels**: If user has both email and SMS:
   - Uses `defaultChannel` if specified
   - Throws an error if no default and no override provided

## CLI Commands

System entries are managed via CLI commands that update `src/testdata/dataStore.json`:

```bash
# Add a new system entry
npx pilot system:add salesforce.mfaUsers.adminC

# Delete a system entry
npx pilot system:delete salesforce.mfaUsers.adminC
```

These commands call `updateSystemRegistry()` internally. Tests should never create or modify system entries directly.

## DataStore User Model

For **test data** (not system identities), user models typically look like:

```typescript
// src/testdata/models/User.ts
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  role: "admin" | "agent" | "viewer";
  address: {
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
  };
}
```

Test data lives under `test.*` keys in `src/testdata/runState.json` (gitignored, ephemeral) and is managed via `set()`/`get()` fixtures. Do NOT use `set()` to author system data.

## Fixture API Reference

### `mail` Fixture

```typescript
mail.waitForMessage(userOrRecipient, criteria?): Promise<NormalizedMessage>
mail.getLatestMessage(userOrRecipient, criteria?): Promise<NormalizedMessage>
```

### `otp` Fixture

```typescript
otp.waitForCode(mfaUser, options?): Promise<{ code: string, message: NormalizedMessage, receivedAt: Date }>
```

### `links` Fixture

```typescript
links.waitForLink(userOrRecipient, { contains, subjectContains?, timeoutMs? }): Promise<string>
```

### `mailCleanup` Fixture (Optional)

```typescript
mailCleanup.deleteMessage(messageId): Promise<void>
mailCleanup.clearServer(): Promise<void>
```

### `mailAttachments` Fixture

> **Future**: Attachment handling is not yet implemented. Do not use.

## Troubleshooting

### "MAILOSAUR_SERVER_ID environment variable is not set"

A system user entry contains `<serverId>` placeholder but `MAILOSAUR_SERVER_ID` is not set. Add it to your `.env` or pipeline variables.

### "Missing required environment variable"

Ensure `MAILOSAUR_API_KEY` and `MAILOSAUR_SERVER_ID` are set in your `.env` or pipeline.

### "No OTP code found in message"

- Check that the email/SMS was sent to the correct Mailosaur address
- Verify the message contains a code matching expected patterns (6-digit, etc.)
- Increase `timeoutMs` if the message takes longer to arrive

### "Multiple OTP codes found"

The message contains multiple codes. The framework cannot determine which to use. Review the email template or use more specific subject/body criteria.

### "User has multiple MFA channels but no defaultChannel"

Add `defaultChannel: "email"` or `"sms"` to the user's MFA config, or pass `{ mfaChannel: "..." }` to `login()`.

### "MFA helper is not configured"

Mailosaur environment variables are missing. Set `MAILOSAUR_API_KEY` and `MAILOSAUR_SERVER_ID`.

### "Message receivedAt timestamp is missing"

The Mailosaur API returned a message without a timestamp. This is unexpected - contact Mailosaur support or check API status.
