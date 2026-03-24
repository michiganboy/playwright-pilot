// Salesforce auth configuration loading and validation.
import type { SalesforceAuthConfig } from "./types";

const AUTH_MODE_ENV = "SF_AUTH_MODE";
const ENABLED_MODE = "jwt-frontdoor";

const ENV_KEYS = {
  clientId: "SF_CLIENT_ID",
  username: "SF_USERNAME",
  loginUrl: "SF_LOGIN_URL",
  privateKeyPath: "SF_PRIVATE_KEY_PATH",
  privateKeyContent: "SF_PRIVATE_KEY",
  retUrl: "SF_RET_URL",
  expectedDomain: "SF_EXPECTED_DOMAIN",
  storageStatePath: "SF_STORAGE_STATE_PATH",
  tokenLifetimeSec: "SF_TOKEN_LIFETIME_SEC",
} as const;

const DEFAULT_LOGIN_URL = "https://login.salesforce.com";
const DEFAULT_TOKEN_LIFETIME_SEC = 180;
const MAX_TOKEN_LIFETIME_SEC = 300;

export function isSalesforceAuthEnabled(): boolean {
  return process.env[AUTH_MODE_ENV] === ENABLED_MODE;
}

export function loadSalesforceConfig(): SalesforceAuthConfig {
  const missing: string[] = [];

  const clientId = process.env[ENV_KEYS.clientId];
  const username = process.env[ENV_KEYS.username];
  const privateKeyPath = process.env[ENV_KEYS.privateKeyPath];
  const privateKeyContent = process.env[ENV_KEYS.privateKeyContent];

  if (!clientId) missing.push(ENV_KEYS.clientId);
  if (!username) missing.push(ENV_KEYS.username);
  if (!privateKeyPath && !privateKeyContent) {
    missing.push(`${ENV_KEYS.privateKeyPath} or ${ENV_KEYS.privateKeyContent}`);
  }

  if (missing.length > 0) {
    throw new Error(
      `Salesforce auth configuration incomplete. Missing required environment variables: ${missing.join(", ")}. ` +
        `Set SF_AUTH_MODE=jwt-frontdoor and provide all required variables.`
    );
  }

  const tokenLifetimeRaw = process.env[ENV_KEYS.tokenLifetimeSec];
  const tokenLifetimeSec = tokenLifetimeRaw
    ? parseInt(tokenLifetimeRaw, 10)
    : DEFAULT_TOKEN_LIFETIME_SEC;

  if (
    isNaN(tokenLifetimeSec) ||
    tokenLifetimeSec < 1 ||
    tokenLifetimeSec > MAX_TOKEN_LIFETIME_SEC
  ) {
    throw new Error(
      `${ENV_KEYS.tokenLifetimeSec} must be an integer between 1 and ${MAX_TOKEN_LIFETIME_SEC}. Got: ${tokenLifetimeRaw}`
    );
  }

  return {
    clientId: clientId!,
    username: username!,
    loginUrl: process.env[ENV_KEYS.loginUrl] || DEFAULT_LOGIN_URL,
    privateKeyPath,
    privateKeyContent,
    retUrl: process.env[ENV_KEYS.retUrl],
    expectedDomain: process.env[ENV_KEYS.expectedDomain],
    storageStatePath: process.env[ENV_KEYS.storageStatePath],
    tokenLifetimeSec,
  };
}

export function validateSalesforceConfig(config: SalesforceAuthConfig): void {
  if (!config.clientId) throw new Error("SalesforceAuthConfig.clientId is required.");
  if (!config.username) throw new Error("SalesforceAuthConfig.username is required.");
  if (!config.loginUrl) throw new Error("SalesforceAuthConfig.loginUrl is required.");
  if (!config.privateKeyPath && !config.privateKeyContent) {
    throw new Error(
      "SalesforceAuthConfig requires either privateKeyPath or privateKeyContent."
    );
  }
  if (config.tokenLifetimeSec < 1 || config.tokenLifetimeSec > MAX_TOKEN_LIFETIME_SEC) {
    throw new Error(
      `SalesforceAuthConfig.tokenLifetimeSec must be 1-${MAX_TOKEN_LIFETIME_SEC}. Got: ${config.tokenLifetimeSec}`
    );
  }
}
