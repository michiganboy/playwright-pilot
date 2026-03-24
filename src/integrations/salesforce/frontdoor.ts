// Salesforce frontdoor.jsp URL builder for browser session bootstrap.

/**
 * Builds a frontdoor.jsp URL that establishes an authenticated Salesforce
 * UI session using the access token from the JWT bearer flow.
 */
export function buildFrontdoorUrl(
  instanceUrl: string,
  accessToken: string,
  retUrl?: string
): string {
  const baseUrl = `${instanceUrl.replace(/\/$/, "")}/secur/frontdoor.jsp`;
  const params = new URLSearchParams({ sid: accessToken });

  if (retUrl) {
    params.set("retURL", retUrl);
  }

  return `${baseUrl}?${params.toString()}`;
}

/** Returns a version of the URL with the sid parameter redacted. */
export function redactFrontdoorUrl(url: string): string {
  return url.replace(/sid=[^&]+/, "sid=[REDACTED]");
}
