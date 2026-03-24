# Salesforce Authentication: JWT-Frontdoor

Playwright Pilot supports fully automated Salesforce UI authentication using the OAuth2 JWT bearer flow combined with frontdoor.jsp session bootstrap. This allows Playwright tests to authenticate into a Salesforce org without interactive login.

## How It Works

```
autoPilot.login()
  ↓
SalesforceAuthProvider.authenticate(page)
  ↓
1. Build JWT assertion (RS256-signed)
  ↓
2. Exchange JWT for access token (POST /services/oauth2/token)
  ↓
3. Navigate browser to frontdoor.jsp?sid={token}
  ↓
4. Verify UI session is established
  ↓
5. Optionally save Playwright storage state
```

When `SF_AUTH_MODE=jwt-frontdoor` is set, `autoPilot.login()` automatically uses the Salesforce JWT-frontdoor flow instead of the standard LoginPilot UI form flow.

## Prerequisites

### Salesforce Connected App Setup

1. Create a Connected App in Salesforce Setup
2. Enable OAuth settings with the `api` and `web` scopes
3. Enable **Use Digital Signatures**
4. Upload the X.509 certificate (public key) corresponding to your private key
5. Under **Manage**, set **Permitted Users** to "Admin approved users are pre-authorized"
6. Add the target user(s) to the Connected App's profile or permission set

### Key Pair

Generate an RSA key pair if you don't have one:

```bash
# Generate private key
openssl genrsa -out server.key 2048

# Generate certificate (public key) for upload to Salesforce
openssl req -new -x509 -key server.key -out server.crt -days 365
```

Upload `server.crt` to the Connected App. Keep `server.key` secure and reference it via `SF_PRIVATE_KEY_PATH`.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SF_AUTH_MODE` | Yes | - | Set to `jwt-frontdoor` to enable |
| `SF_CLIENT_ID` | Yes | - | Connected App consumer key |
| `SF_USERNAME` | Yes | - | Salesforce username to authenticate as |
| `SF_PRIVATE_KEY_PATH` | One of path/content | - | Path to PEM private key file |
| `SF_PRIVATE_KEY` | One of path/content | - | Raw PEM key content (for CI secrets) |
| `SF_LOGIN_URL` | No | `https://login.salesforce.com` | `https://test.salesforce.com` for sandboxes |
| `SF_RET_URL` | No | - | URL path to redirect to after auth (e.g., `/lightning/page/home`) |
| `SF_EXPECTED_DOMAIN` | No | - | Expected org domain for session verification |
| `SF_STORAGE_STATE_PATH` | No | - | Path to save Playwright browser storage state |
| `SF_TOKEN_LIFETIME_SEC` | No | `180` | JWT lifetime in seconds (max 300) |

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

In CI environments, pass the private key as a secret instead of a file:

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
- Do not commit `.env` files or private keys to version control

## Troubleshooting

### "Salesforce token exchange failed. JWT grant is invalid."

Verify:
1. The Connected App has **Use Digital Signatures** enabled
2. The user is pre-authorized (added to the Connected App's permitted users)
3. The private key matches the certificate uploaded to the Connected App
4. `SF_CLIENT_ID` and `SF_USERNAME` are correct
5. `SF_LOGIN_URL` matches the org type (`login.salesforce.com` for production, `test.salesforce.com` for sandboxes)

### "Page did not redirect from frontdoor.jsp"

The access token may not grant UI access. Verify:
1. The Connected App OAuth scopes include `web` or `full`
2. The user has a Salesforce license with UI access
3. The user is not locked out or deactivated

### "Landed on unexpected domain"

The `SF_EXPECTED_DOMAIN` may not match the actual org domain. Check the `instance_url` from the token response or remove `SF_EXPECTED_DOMAIN` to skip domain verification.

### "Redirected to a login page after frontdoor bootstrap"

The access token may be expired or the org may require additional verification. Try:
1. Reducing `SF_TOKEN_LIFETIME_SEC` (tokens expire quickly)
2. Verifying the user has no additional authentication requirements (e.g., IP restrictions)
3. Checking the Connected App's session policies

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
