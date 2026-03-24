import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import {
  isSalesforceAuthEnabled,
  loadSalesforceConfig,
  validateSalesforceConfig,
} from "../config";
import type { SalesforceAuthConfig } from "../types";

const ORIGINAL_ENV = { ...process.env };

function setRequiredEnv(overrides: Record<string, string | undefined> = {}): void {
  const defaults: Record<string, string> = {
    SF_AUTH_MODE: "jwt-frontdoor",
    SF_CLIENT_ID: "3MVG9.test.consumer.key",
    SF_USERNAME: "admin@myorg.test",
    SF_PRIVATE_KEY_PATH: "./keys/server.key",
  };
  Object.assign(process.env, defaults, overrides);
}

function clearSfEnv(): void {
  const keys = Object.keys(process.env).filter((k) => k.startsWith("SF_"));
  keys.forEach((k) => delete process.env[k]);
}

beforeEach(() => {
  clearSfEnv();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("isSalesforceAuthEnabled", () => {
  test("returns true when SF_AUTH_MODE=jwt-frontdoor", () => {
    process.env.SF_AUTH_MODE = "jwt-frontdoor";
    expect(isSalesforceAuthEnabled()).toBe(true);
  });

  test("returns false when SF_AUTH_MODE is not set", () => {
    delete process.env.SF_AUTH_MODE;
    expect(isSalesforceAuthEnabled()).toBe(false);
  });

  test("returns false for unrecognized values", () => {
    process.env.SF_AUTH_MODE = "password";
    expect(isSalesforceAuthEnabled()).toBe(false);
  });
});

describe("loadSalesforceConfig", () => {
  test("loads all values from environment", () => {
    setRequiredEnv({
      SF_LOGIN_URL: "https://test.salesforce.com",
      SF_RET_URL: "/lightning/page/home",
      SF_EXPECTED_DOMAIN: "https://myorg.my.salesforce.com",
      SF_STORAGE_STATE_PATH: "./sf-state.json",
      SF_TOKEN_LIFETIME_SEC: "120",
    });

    const config = loadSalesforceConfig();
    expect(config).toEqual({
      clientId: "3MVG9.test.consumer.key",
      username: "admin@myorg.test",
      loginUrl: "https://test.salesforce.com",
      privateKeyPath: "./keys/server.key",
      privateKeyContent: undefined,
      retUrl: "/lightning/page/home",
      expectedDomain: "https://myorg.my.salesforce.com",
      storageStatePath: "./sf-state.json",
      tokenLifetimeSec: 120,
    });
  });

  test("applies default loginUrl and tokenLifetimeSec", () => {
    setRequiredEnv();
    const config = loadSalesforceConfig();
    expect(config.loginUrl).toBe("https://login.salesforce.com");
    expect(config.tokenLifetimeSec).toBe(180);
  });

  test("accepts privateKeyContent instead of privateKeyPath", () => {
    setRequiredEnv({ SF_PRIVATE_KEY_PATH: undefined, SF_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----" });
    delete process.env.SF_PRIVATE_KEY_PATH;
    const config = loadSalesforceConfig();
    expect(config.privateKeyContent).toContain("BEGIN RSA PRIVATE KEY");
    expect(config.privateKeyPath).toBeUndefined();
  });

  test("throws when SF_CLIENT_ID is missing", () => {
    setRequiredEnv({ SF_CLIENT_ID: undefined });
    delete process.env.SF_CLIENT_ID;
    expect(() => loadSalesforceConfig()).toThrow("SF_CLIENT_ID");
  });

  test("throws when SF_USERNAME is missing", () => {
    setRequiredEnv({ SF_USERNAME: undefined });
    delete process.env.SF_USERNAME;
    expect(() => loadSalesforceConfig()).toThrow("SF_USERNAME");
  });

  test("throws when no key source is provided", () => {
    setRequiredEnv({ SF_PRIVATE_KEY_PATH: undefined });
    delete process.env.SF_PRIVATE_KEY_PATH;
    delete process.env.SF_PRIVATE_KEY;
    expect(() => loadSalesforceConfig()).toThrow("SF_PRIVATE_KEY_PATH or SF_PRIVATE_KEY");
  });

  test("throws when tokenLifetimeSec exceeds 300", () => {
    setRequiredEnv({ SF_TOKEN_LIFETIME_SEC: "301" });
    expect(() => loadSalesforceConfig()).toThrow("between 1 and 300");
  });

  test("throws when tokenLifetimeSec is zero", () => {
    setRequiredEnv({ SF_TOKEN_LIFETIME_SEC: "0" });
    expect(() => loadSalesforceConfig()).toThrow("between 1 and 300");
  });

  test("throws when tokenLifetimeSec is not a number", () => {
    setRequiredEnv({ SF_TOKEN_LIFETIME_SEC: "abc" });
    expect(() => loadSalesforceConfig()).toThrow("between 1 and 300");
  });

  test("collects all missing variables in a single error", () => {
    // Nothing set
    expect(() => loadSalesforceConfig()).toThrow(/SF_CLIENT_ID.*SF_USERNAME/s);
  });
});

describe("validateSalesforceConfig", () => {
  const validConfig: SalesforceAuthConfig = {
    clientId: "test-client",
    username: "user@test.com",
    loginUrl: "https://login.salesforce.com",
    privateKeyPath: "./key.pem",
    tokenLifetimeSec: 180,
  };

  test("passes for valid config", () => {
    expect(() => validateSalesforceConfig(validConfig)).not.toThrow();
  });

  test("rejects missing clientId", () => {
    expect(() =>
      validateSalesforceConfig({ ...validConfig, clientId: "" })
    ).toThrow("clientId is required");
  });

  test("rejects missing username", () => {
    expect(() =>
      validateSalesforceConfig({ ...validConfig, username: "" })
    ).toThrow("username is required");
  });

  test("rejects missing loginUrl", () => {
    expect(() =>
      validateSalesforceConfig({ ...validConfig, loginUrl: "" })
    ).toThrow("loginUrl is required");
  });

  test("rejects missing key source", () => {
    expect(() =>
      validateSalesforceConfig({
        ...validConfig,
        privateKeyPath: undefined,
        privateKeyContent: undefined,
      })
    ).toThrow("privateKeyPath or privateKeyContent");
  });

  test("rejects tokenLifetimeSec > 300", () => {
    expect(() =>
      validateSalesforceConfig({ ...validConfig, tokenLifetimeSec: 301 })
    ).toThrow("1-300");
  });

  test("rejects tokenLifetimeSec < 1", () => {
    expect(() =>
      validateSalesforceConfig({ ...validConfig, tokenLifetimeSec: 0 })
    ).toThrow("1-300");
  });

  test("accepts privateKeyContent instead of privateKeyPath", () => {
    expect(() =>
      validateSalesforceConfig({
        ...validConfig,
        privateKeyPath: undefined,
        privateKeyContent: "-----BEGIN RSA PRIVATE KEY-----\nfake",
      })
    ).not.toThrow();
  });
});
