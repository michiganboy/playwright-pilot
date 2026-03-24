// Salesforce UI session verification after frontdoor bootstrap.
import type { Page } from "@playwright/test";
import { redactFrontdoorUrl } from "./frontdoor";

const SF_DOMAIN_SUFFIXES = [
  ".salesforce.com",
  ".force.com",
  ".salesforce-setup.com",
  ".salesforce.mil",
  ".sfcrmapps.cn",
];

const LOGIN_PATH_INDICATORS = ["/login.jsp", "/login"];
const LOGIN_HOST_INDICATORS = ["login.salesforce.com", "test.salesforce.com"];

/**
 * Verifies that the browser has an authenticated Salesforce UI session
 * after navigating through frontdoor.jsp. Checks that the page has
 * redirected away from frontdoor and landed on a valid Salesforce domain.
 */
export async function verifySalesforceSession(
  page: Page,
  instanceUrl: string,
  expectedDomain?: string
): Promise<void> {
  try {
    await page.waitForURL(
      (url) => !url.pathname.includes("/secur/frontdoor.jsp"),
      { timeout: 30000 }
    );
  } catch {
    throw new Error(
      "Salesforce session bootstrap timed out: page did not redirect from frontdoor.jsp within 30s. " +
        "Verify the access token is valid and the connected app grants UI access. " +
        `Current URL: ${redactFrontdoorUrl(page.url())}`
    );
  }

  await page.waitForLoadState("domcontentloaded");

  const currentUrl = new URL(page.url());

  if (expectedDomain) {
    const expected = new URL(
      expectedDomain.startsWith("http") ? expectedDomain : `https://${expectedDomain}`
    );
    if (currentUrl.hostname !== expected.hostname) {
      throw new Error(
        `Salesforce session verification failed: expected domain ${expected.hostname}, ` +
          `but landed on ${currentUrl.hostname}. ` +
          `Check SF_EXPECTED_DOMAIN or verify the connected app and user configuration.`
      );
    }
  }

  const instanceHostname = new URL(instanceUrl).hostname;
  const isExpectedHost = currentUrl.hostname === instanceHostname;
  const isSfDomain = SF_DOMAIN_SUFFIXES.some((suffix) =>
    currentUrl.hostname.endsWith(suffix)
  );

  if (!isExpectedHost && !isSfDomain) {
    throw new Error(
      `Salesforce session verification failed: landed on unexpected domain ${currentUrl.hostname}. ` +
        `Expected instance ${instanceHostname} or a recognized Salesforce domain.`
    );
  }

  const isOnLoginPath = LOGIN_PATH_INDICATORS.some((path) =>
    currentUrl.pathname.toLowerCase().includes(path)
  );
  const isOnLoginHost = LOGIN_HOST_INDICATORS.some(
    (host) => currentUrl.hostname === host
  );

  if (isOnLoginPath || isOnLoginHost) {
    throw new Error(
      "Salesforce session verification failed: browser was redirected to a login page " +
        "after frontdoor bootstrap. The access token may be invalid, expired, or the user " +
        `may lack UI login permissions. Current URL: ${currentUrl.origin}${currentUrl.pathname}`
    );
  }
}
