import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { exchangeJwtForToken, formatTokenError } from "../tokenClient";

const originalFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

function mockFetchNetworkError(message: string): void {
  globalThis.fetch = (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("exchangeJwtForToken", () => {
  test("returns parsed token response on success", async () => {
    const tokenResponse = {
      access_token: "00D...token",
      instance_url: "https://myorg.my.salesforce.com",
      id: "https://login.salesforce.com/id/00Dxx/005xx",
      token_type: "Bearer",
      issued_at: "1234567890",
      signature: "sig=",
    };
    mockFetch(200, tokenResponse);

    const result = await exchangeJwtForToken(
      "https://login.salesforce.com",
      "jwt-assertion"
    );
    expect(result).toEqual(tokenResponse);
  });

  test("throws with diagnostic for invalid_grant", async () => {
    mockFetch(400, {
      error: "invalid_grant",
      error_description: "user hasn't approved this consumer",
    });

    await expect(
      exchangeJwtForToken("https://login.salesforce.com", "bad-jwt")
    ).rejects.toThrow("JWT grant is invalid");
  });

  test("throws with diagnostic for invalid_client", async () => {
    mockFetch(401, {
      error: "invalid_client",
      error_description: "invalid client credentials",
    });

    await expect(
      exchangeJwtForToken("https://login.salesforce.com", "jwt")
    ).rejects.toThrow("Consumer key");
  });

  test("throws on network error with actionable message", async () => {
    mockFetchNetworkError("ECONNREFUSED");

    await expect(
      exchangeJwtForToken("https://login.salesforce.com", "jwt")
    ).rejects.toThrow("network error");
  });

  test("throws when response is missing access_token", async () => {
    mockFetch(200, { instance_url: "https://org.my.salesforce.com" });

    await expect(
      exchangeJwtForToken("https://login.salesforce.com", "jwt")
    ).rejects.toThrow("missing required fields");
  });

  test("throws when response is missing instance_url", async () => {
    mockFetch(200, { access_token: "token" });

    await expect(
      exchangeJwtForToken("https://login.salesforce.com", "jwt")
    ).rejects.toThrow("missing required fields");
  });

  test("redacts assertion in error messages", async () => {
    mockFetch(400, {
      error: "invalid_grant",
      error_description: "bad token",
    });

    try {
      await exchangeJwtForToken(
        "https://login.salesforce.com",
        "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.long-token-value"
      );
    } catch (error) {
      expect((error as Error).message).toContain("[REDACTED]");
      expect((error as Error).message).not.toContain("long-token-value");
    }
  });

  test("strips trailing slash from loginUrl", async () => {
    const tokenResponse = {
      access_token: "token",
      instance_url: "https://org.my.salesforce.com",
      id: "id",
      token_type: "Bearer",
      issued_at: "0",
      signature: "sig",
    };
    mockFetch(200, tokenResponse);

    const result = await exchangeJwtForToken(
      "https://login.salesforce.com/",
      "jwt"
    );
    expect(result.access_token).toBe("token");
  });
});

describe("formatTokenError", () => {
  test("returns diagnostic for known error codes", () => {
    expect(formatTokenError({ error: "invalid_grant", error_description: "x" })).toContain(
      "JWT grant is invalid"
    );
    expect(formatTokenError({ error: "invalid_client", error_description: "x" })).toContain(
      "Consumer key"
    );
    expect(formatTokenError({ error: "unauthorized_client", error_description: "x" })).toContain(
      "Use Digital Signatures"
    );
    expect(formatTokenError({ error: "invalid_app_access", error_description: "x" })).toContain(
      "access to this connected app"
    );
    expect(
      formatTokenError({ error: "user_authentication_failed", error_description: "x" })
    ).toContain("SF_USERNAME");
  });

  test("falls back to raw error for unknown codes", () => {
    const result = formatTokenError({
      error: "unknown_error",
      error_description: "something unexpected",
    });
    expect(result).toBe("unknown_error: something unexpected");
  });
});
