// Salesforce JWT-frontdoor auth provider for Playwright Pilot.
import { promises as fs } from "fs";
import path from "path";
import type { Page } from "@playwright/test";
import type { AuthProvider } from "../../utils/autoPilot";
import type { SalesforceAuthConfig } from "./types";
import {
  validateSalesforceConfig,
  loadSalesforceConfig,
  isSalesforceAuthEnabled,
} from "./config";
import { buildJwtClaims, signJwtAssertion } from "./jwtSigner";
import { exchangeJwtForToken } from "./tokenClient";
import { buildFrontdoorUrl, redactFrontdoorUrl } from "./frontdoor";
import { verifySalesforceSession } from "./sessionVerifier";

async function loadPrivateKey(config: SalesforceAuthConfig): Promise<string> {
  if (config.privateKeyContent) {
    return config.privateKeyContent;
  }

  if (!config.privateKeyPath) {
    throw new Error(
      "Salesforce private key not configured. Set SF_PRIVATE_KEY_PATH or SF_PRIVATE_KEY."
    );
  }

  const keyPath = path.resolve(config.privateKeyPath);
  try {
    return await fs.readFile(keyPath, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read Salesforce private key from ${keyPath}. ` +
        `Verify SF_PRIVATE_KEY_PATH points to a valid PEM file. ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Authenticates a Playwright browser session into Salesforce UI using
 * the OAuth2 JWT bearer flow and frontdoor.jsp session bootstrap.
 *
 * Flow:
 *  1. Build and sign a JWT assertion (RS256)
 *  2. Exchange the JWT for a Salesforce access token
 *  3. Navigate the browser through frontdoor.jsp with the access token
 *  4. Verify the UI session is established
 *  5. Optionally save Playwright storage state
 */
export class SalesforceAuthProvider implements AuthProvider {
  private privateKey: string;
  private config: SalesforceAuthConfig;
  private lastInstanceUrl?: string;

  constructor(config: SalesforceAuthConfig, privateKey: string) {
    validateSalesforceConfig(config);
    this.config = config;
    this.privateKey = privateKey;
  }

  async authenticate(page: Page): Promise<void> {
    const claims = buildJwtClaims(
      this.config.clientId,
      this.config.username,
      this.config.loginUrl,
      this.config.tokenLifetimeSec
    );

    const assertion = signJwtAssertion(claims, this.privateKey);
    const tokenResponse = await exchangeJwtForToken(this.config.loginUrl, assertion);

    this.lastInstanceUrl = tokenResponse.instance_url;

    const frontdoorUrl = buildFrontdoorUrl(
      tokenResponse.instance_url,
      tokenResponse.access_token,
      this.config.retUrl
    );

    try {
      await page.goto(frontdoorUrl, { waitUntil: "domcontentloaded" });
    } catch (error) {
      throw new Error(
        `Failed to navigate to Salesforce frontdoor: ${redactFrontdoorUrl(frontdoorUrl)}. ` +
          `${error instanceof Error ? error.message : String(error)}`
      );
    }

    await verifySalesforceSession(
      page,
      tokenResponse.instance_url,
      this.config.expectedDomain
    );

    if (this.config.storageStatePath) {
      const statePath = path.resolve(this.config.storageStatePath);
      await fs.mkdir(path.dirname(statePath), { recursive: true });
      await page.context().storageState({ path: statePath });
    }
  }

  getInstanceUrl(): string | undefined {
    return this.lastInstanceUrl;
  }

  getConfig(): Pick<
    SalesforceAuthConfig,
    "username" | "loginUrl" | "expectedDomain" | "retUrl"
  > {
    return {
      username: this.config.username,
      loginUrl: this.config.loginUrl,
      expectedDomain: this.config.expectedDomain,
      retUrl: this.config.retUrl,
    };
  }
}

/** Creates a SalesforceAuthProvider by loading config from env and reading the private key. */
export async function createSalesforceAuthProvider(
  config?: SalesforceAuthConfig
): Promise<SalesforceAuthProvider> {
  const resolvedConfig = config ?? loadSalesforceConfig();
  const privateKey = await loadPrivateKey(resolvedConfig);
  return new SalesforceAuthProvider(resolvedConfig, privateKey);
}

/** Creates a SalesforceAuthProvider if SF_AUTH_MODE=jwt-frontdoor is set. Returns undefined otherwise. */
export async function createSalesforceAuthIfConfigured(): Promise<
  SalesforceAuthProvider | undefined
> {
  if (!isSalesforceAuthEnabled()) return undefined;
  return createSalesforceAuthProvider();
}
