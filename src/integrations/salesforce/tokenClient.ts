// Salesforce OAuth2 JWT bearer token exchange client.
import type { SalesforceTokenResponse, SalesforceTokenError } from "./types";

const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";

function redactAssertion(assertion: string): string {
  if (assertion.length <= 20) return "[REDACTED]";
  return `${assertion.substring(0, 10)}...[REDACTED]`;
}

/**
 * Exchanges a signed JWT assertion for a Salesforce access token
 * via the OAuth2 JWT bearer flow.
 */
export async function exchangeJwtForToken(
  loginUrl: string,
  assertion: string
): Promise<SalesforceTokenResponse> {
  const tokenUrl = `${loginUrl.replace(/\/$/, "")}/services/oauth2/token`;

  const body = new URLSearchParams({
    grant_type: GRANT_TYPE,
    assertion,
  });

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (error) {
    throw new Error(
      `Salesforce token exchange failed: network error connecting to ${tokenUrl}. ` +
        `Verify SF_LOGIN_URL is correct and reachable. ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }

  const responseBody = await response.text();

  if (!response.ok) {
    let errorDetail: string;
    try {
      const parsed = JSON.parse(responseBody) as SalesforceTokenError;
      errorDetail = formatTokenError(parsed);
    } catch {
      errorDetail = `HTTP ${response.status}: ${responseBody.substring(0, 200)}`;
    }

    throw new Error(
      `Salesforce token exchange failed. ${errorDetail} Assertion: ${redactAssertion(assertion)}`
    );
  }

  try {
    const tokenResponse = JSON.parse(responseBody) as SalesforceTokenResponse;
    if (!tokenResponse.access_token || !tokenResponse.instance_url) {
      throw new Error(
        "Salesforce token response missing required fields (access_token or instance_url)."
      );
    }
    return tokenResponse;
  } catch (error) {
    if (error instanceof Error && error.message.includes("missing required fields")) {
      throw error;
    }
    throw new Error(
      `Salesforce token response is not valid JSON. HTTP ${response.status}: ${responseBody.substring(0, 200)}`
    );
  }
}

/** Maps Salesforce OAuth error codes to actionable diagnostic messages. */
export function formatTokenError(error: SalesforceTokenError): string {
  const diagnostics: Record<string, string> = {
    invalid_grant:
      "JWT grant is invalid. Verify: (1) connected app has 'Use Digital Signatures' enabled, " +
      "(2) user is pre-authorized or admin-approved, (3) private key matches the certificate " +
      "uploaded to the connected app, (4) username and client_id are correct.",
    invalid_client:
      "Consumer key (SF_CLIENT_ID) is invalid. Verify the connected app exists and is enabled.",
    invalid_client_id:
      "Consumer key (SF_CLIENT_ID) is not recognized. Verify the connected app consumer key.",
    unauthorized_client:
      "Connected app is not authorized for JWT bearer flow. Enable 'Use Digital Signatures' " +
      "in the connected app settings.",
    invalid_app_access:
      "User does not have access to this connected app. Add the user to the connected app's " +
      "permitted users or set 'Admin approved users are pre-authorized'.",
    user_authentication_failed:
      "User authentication failed. Verify SF_USERNAME is correct and the user is active.",
  };

  return diagnostics[error.error] || `${error.error}: ${error.error_description}`;
}
