# Salesforce Authentication: JWT-Frontdoor

Playwright Pilot supports fully automated Salesforce UI authentication using the OAuth2 JWT bearer flow combined with frontdoor.jsp session bootstrap. This allows Playwright tests to authenticate into a Salesforce org without interactive login.

## How It Works

```
autoPilot.login()
  ↓
SalesforceAuthProvider.authenticate(page)
  ↓
1. Framework signs a JWT assertion with RS256 using your private key
  ↓
2. JWT is POSTed to the Salesforce login host (/services/oauth2/token)
  ↓
3. Salesforce validates the JWT against the certificate uploaded to the External Client App
  ↓
4. Salesforce returns an access_token and instance_url
  ↓
5. Framework navigates browser to {instance_url}/secur/frontdoor.jsp?sid={access_token}
  ↓
6. Salesforce sets session cookies and redirects to Lightning
  ↓
7. Framework verifies the UI session is established
  ↓
8. Optionally saves Playwright storage state
```

When `SF_AUTH_MODE=jwt-frontdoor` is set, `autoPilot.login()` automatically uses this flow instead of the standard LoginPilot UI form flow.

## Prerequisites

### Generate a Key Pair

Create an RSA private key and a self-signed X.509 certificate. The certificate (`.crt`) is uploaded to Salesforce. The private key (`.key`) stays with your project and is used by the framework to sign JWTs. Never commit the private key.

```bash
# Generate the private key
openssl genrsa -out keys/server.key 2048

# Generate the certificate from the private key
openssl req -new -x509 -key keys/server.key -out keys/server.crt -days 365 \
  -subj "/CN=PlaywrightPilot/O=YourOrg"
```

Add `keys/` to `.gitignore` if it isn't already.

> **Important:** Upload the `.crt` file (certificate/public key) to Salesforce. The `.key` file (private key) never leaves your machine or CI secret store.

### Create the External Client App

Current Salesforce orgs use External Client Apps instead of legacy Connected Apps. If your org still shows the legacy "App Manager > New Connected App" flow, the OAuth concepts are the same but the UI navigation differs.

1. In Salesforce Setup, search for **External Client App** and select **External Client App Manager**
2. Click **New External Client App**
3. Fill in the basic info:
   - **External Client App Name** (e.g., "Playwright Pilot")
   - **Description** (optional)
   - **Contact Email**
4. Click **Create**

### Enable OAuth and JWT Bearer Flow

After creating the app, configure its OAuth settings:

1. On the External Client App detail page, navigate to the **OAuth Settings** section
2. Click **Configure** or **Edit** to open the OAuth settings
3. Set **Callback URL** to `https://login.salesforce.com/services/oauth2/callback` (not used by the JWT flow, but required by the form)
4. Add these **OAuth Scopes**:
   - `Manage user data via APIs (api)`
   - `Manage user data via Web browsers (web)`
   - `Perform requests at any time (refresh_token, offline_access)`
   - `Access the identity URL service (id, profile, email, address, phone)`
   - `Access unique user identifiers (openid)`
5. Enable the **JWT Bearer Flow** (may be labeled "Enable JWT Bearer Flow" or "Use Digital Signatures" depending on your org's UI)
6. Upload `keys/server.crt` when prompted for the certificate / digital signature file
7. Save

> It can take 2-10 minutes for a new External Client App to propagate across the Salesforce infrastructure. If the token exchange fails immediately after setup, wait and retry.

### Configure Pre-Authorization

The JWT bearer flow does not prompt the user for consent, so the user must be pre-authorized on the app.

1. On the External Client App, navigate to the **Policies** or **OAuth Policies** section (may require clicking **Manage**)
2. Set **Permitted Users** to **Admin approved users are pre-authorized**
3. Save
4. Under **Profiles** or **Permission Sets**, add the profile or permission set that includes the Salesforce user you want to automate

If this step is skipped, the JWT flow will fail with `invalid_grant` because the user has not been pre-approved.

### Get the Consumer Key

1. On the External Client App detail page, look for the **Consumer Key** (also called **Client ID**)
2. You may need to click **Manage Consumer Details** and verify your identity via email or authenticator
3. Copy the **Consumer Key** — this is your `SF_CLIENT_ID`

The **Consumer Secret** may also be displayed. It is not needed for the JWT bearer flow and should not be stored in your project.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SF_AUTH_MODE` | Yes | - | Set to `jwt-frontdoor` to enable |
| `SF_CLIENT_ID` | Yes | - | Consumer Key from the External Client App |
| `SF_USERNAME` | Yes | - | Exact Salesforce username to authenticate as (e.g., `admin@myorg.test`) |
| `SF_PRIVATE_KEY_PATH` | One of path/content | - | Relative or absolute path to the PEM private key file used to sign the JWT (e.g., `./keys/server.key`) |
| `SF_PRIVATE_KEY` | One of path/content | - | Raw PEM key content (for CI environments where the key is stored as a secret) |
| `SF_LOGIN_URL` | No | `https://login.salesforce.com` | Token endpoint host. Use `https://test.salesforce.com` for sandboxes, `https://login.salesforce.com` for production |
| `SF_RET_URL` | No | - | URL path the browser should land on after frontdoor authentication (e.g., `/lightning/page/home`). If omitted, Salesforce redirects to the user's default home page |
| `SF_EXPECTED_DOMAIN` | No | - | Your org's My Domain base URL for session verification (e.g., `https://myorg--dev.sandbox.my.salesforce.com`). This is your org domain, not the login host |
| `SF_STORAGE_STATE_PATH` | No | - | Path to save Playwright browser storage state after authentication |
| `SF_TOKEN_LIFETIME_SEC` | No | `180` | JWT assertion lifetime in seconds (max 300 per Salesforce) |

### Example `.env`

```env
SF_AUTH_MODE=jwt-frontdoor
SF_CLIENT_ID=3MVG9...your_consumer_key
SF_USERNAME=admin@myorg.test
SF_LOGIN_URL=https://test.salesforce.com
SF_PRIVATE_KEY_PATH=./keys/server.key
SF_RET_URL=/lightning/page/home
SF_EXPECTED_DOMAIN=https://myorg--dev.sandbox.my.salesforce.com
```

### CI Configuration

In CI environments, pass the private key as a secret instead of a file path:

```env
SF_AUTH_MODE=jwt-frontdoor
SF_CLIENT_ID=3MVG9...
SF_USERNAME=admin@myorg.test
SF_PRIVATE_KEY=${{ secrets.SF_PRIVATE_KEY }}
```

## Usage in Tests

### Standard Usage (via AutoPilot)

When `SF_AUTH_MODE=jwt-frontdoor` is set, `autoPilot.login()` transparently uses the Salesforce auth flow:

```typescript
import { test, expect } from "../../fixtures/test-fixtures";

test.describe.serial("SF-001 - Salesforce Dashboard @salesforce", () => {
  test("[10001] User can view home page", async ({ page, autoPilot }) => {
    await autoPilot.login();

    await expect(page).toHaveURL(/lightning/);
  });
});
```

### Direct Access (via salesforceAuth fixture)

For tests that need direct access to the Salesforce auth provider:

```typescript
import { test, expect } from "../../fixtures/test-fixtures";

test("Salesforce auth provides instance URL", async ({ page, salesforceAuth }) => {
  if (!salesforceAuth) {
    test.skip();
    return;
  }

  await salesforceAuth.authenticate(page);
  const instanceUrl = salesforceAuth.getInstanceUrl();
  expect(instanceUrl).toContain(".salesforce.com");
});
```

## Coexistence with Standard Login

The Salesforce auth mode coexists with the standard LoginPilot flow:

- When `SF_AUTH_MODE=jwt-frontdoor` is set: `autoPilot.login()` uses JWT-frontdoor
- When `SF_AUTH_MODE` is unset or any other value: `autoPilot.login()` uses LoginPilot as before

All existing tests using `autoPilot.login()` with LoginPilot continue to work without changes when the Salesforce env vars are not set.

## Storage State

When `SF_STORAGE_STATE_PATH` is configured, the provider saves Playwright browser storage state after authentication. This can be used with Playwright's `storageState` option to reuse sessions across tests.

## Security

- Private keys, JWTs, access tokens, and frontdoor URLs containing `sid` values are never logged
- Error messages from the token exchange redact the JWT assertion
- The `salesforceAuth.getConfig()` method only exposes non-sensitive configuration
- The Consumer Secret is not used or stored by this implementation
- Do not commit `.env` files or private keys to version control

## Troubleshooting

### "Salesforce token exchange failed. JWT grant is invalid." (`invalid_grant`)

This is the most common error. Check each of these in order:

1. **Login URL mismatch** — `SF_LOGIN_URL` must match the org type. Use `https://test.salesforce.com` for sandboxes and `https://login.salesforce.com` for production. Using the wrong one will always fail.
2. **Wrong username** — `SF_USERNAME` must be the exact Salesforce username (e.g., `admin@myorg.test`), not an email alias. This value is placed in the JWT `sub` claim and must match exactly.
3. **Certificate mismatch** — The `.crt` file uploaded to the External Client App must be the certificate generated from the same `.key` file referenced by `SF_PRIVATE_KEY_PATH`. If you regenerated keys, you must re-upload the new certificate.
4. **Uploaded wrong file** — Verify you uploaded `server.crt` (the certificate) to Salesforce, not `server.key` (the private key). The private key never leaves your machine.
5. **User not pre-authorized** — The Salesforce user must be pre-authorized on the External Client App via a Profile or Permission Set assignment. Check **Policies > Permitted Users** is set to "Admin approved users are pre-authorized" and the user's profile/permission set is listed.
6. **Consumer Key wrong** — Verify `SF_CLIENT_ID` matches the Consumer Key shown on the External Client App detail page.
7. **JWT bearer flow not enabled** — Confirm the External Client App has the JWT bearer flow / digital signatures enabled and the certificate is uploaded.
8. **Propagation delay** — New or recently modified External Client Apps can take 2-10 minutes to propagate. Wait and retry.

### "Page did not redirect from frontdoor.jsp"

The access token was obtained but the browser session could not be established:

1. Verify the External Client App OAuth scopes include `Manage user data via Web browsers (web)`. Without this scope, the token may not grant UI access.
2. Verify the user has a Salesforce license that allows UI login (not an API-only or integration user).
3. Verify the user is active and not locked out.

### "Landed on unexpected domain"

The browser landed on a domain that doesn't match expectations:

1. If `SF_EXPECTED_DOMAIN` is set, it must match your org's actual My Domain URL (e.g., `https://myorg--dev.sandbox.my.salesforce.com`). This is the org domain, not the login host (`login.salesforce.com`).
2. The `instance_url` returned by the token exchange is the authoritative domain. If unsure, remove `SF_EXPECTED_DOMAIN` temporarily to skip this check, then inspect the URL the browser lands on.
3. Some orgs redirect through intermediate domains during session setup. If the final URL is valid but the intermediate one triggers the error, consider adjusting or removing `SF_EXPECTED_DOMAIN`.

### "Redirected to a login page after frontdoor bootstrap"

The frontdoor navigation did not establish a session:

1. The access token may have expired. Reduce `SF_TOKEN_LIFETIME_SEC` or ensure the token exchange and frontdoor navigation happen without long delays.
2. The user may have IP restrictions or login hour restrictions that prevent session creation from the test runner's IP.
3. The org may have session policies or "High Assurance" requirements that block frontdoor-based sessions.
4. Check the External Client App's session policies and the user's profile login IP ranges.

### Network or connectivity errors

1. Verify the test runner can reach `SF_LOGIN_URL` (no firewall or proxy blocking `login.salesforce.com` or `test.salesforce.com`).
2. In CI environments, ensure outbound HTTPS (port 443) is allowed to Salesforce endpoints.

### Browser lands on wrong page after authentication

1. If the browser authenticates successfully but lands on an unexpected page, set `SF_RET_URL` to the desired path (e.g., `/lightning/page/home`).
2. If `SF_RET_URL` is set but the browser still lands elsewhere, Salesforce may be overriding the redirect based on user preferences or org settings. Verify the path is valid in your org.

## Architecture

The Salesforce auth integration follows the same patterns as other Playwright Pilot integrations:

```
src/integrations/salesforce/
├── types.ts            # Type definitions
├── config.ts           # Environment config loading + validation
├── jwtSigner.ts        # JWT assertion builder + RS256 signer
├── tokenClient.ts      # OAuth2 token exchange client
├── frontdoor.ts        # Frontdoor URL builder + redaction
├── sessionVerifier.ts  # UI session verification
├── salesforceAuth.ts   # Auth provider orchestrator
├── index.ts            # Barrel exports
└── __tests__/          # Unit tests
```

## See Also

- [Login Architecture](./login.md) - AutoPilot + LoginPilot documentation
- [README.md](../README.md) - Main documentation
