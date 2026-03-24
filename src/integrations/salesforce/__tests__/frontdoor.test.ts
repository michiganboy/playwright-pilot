import { describe, test, expect } from "@jest/globals";
import { buildFrontdoorUrl, redactFrontdoorUrl } from "../frontdoor";

describe("buildFrontdoorUrl", () => {
  test("builds URL with sid parameter", () => {
    const url = buildFrontdoorUrl(
      "https://myorg.my.salesforce.com",
      "access-token-123"
    );
    expect(url).toBe(
      "https://myorg.my.salesforce.com/secur/frontdoor.jsp?sid=access-token-123"
    );
  });

  test("includes retURL when provided", () => {
    const url = buildFrontdoorUrl(
      "https://myorg.my.salesforce.com",
      "token",
      "/lightning/page/home"
    );
    expect(url).toContain("sid=token");
    expect(url).toContain("retURL=%2Flightning%2Fpage%2Fhome");
  });

  test("omits retURL when not provided", () => {
    const url = buildFrontdoorUrl(
      "https://myorg.my.salesforce.com",
      "token"
    );
    expect(url).not.toContain("retURL");
  });

  test("strips trailing slash from instanceUrl", () => {
    const url = buildFrontdoorUrl(
      "https://myorg.my.salesforce.com/",
      "token"
    );
    expect(url).toMatch(
      /^https:\/\/myorg\.my\.salesforce\.com\/secur\/frontdoor\.jsp/
    );
    expect(url).not.toContain("//secur");
  });
});

describe("redactFrontdoorUrl", () => {
  test("replaces sid value with [REDACTED]", () => {
    const url =
      "https://myorg.my.salesforce.com/secur/frontdoor.jsp?sid=secret-token&retURL=/home";
    expect(redactFrontdoorUrl(url)).toBe(
      "https://myorg.my.salesforce.com/secur/frontdoor.jsp?sid=[REDACTED]&retURL=/home"
    );
  });

  test("handles URL with only sid parameter", () => {
    const url =
      "https://myorg.my.salesforce.com/secur/frontdoor.jsp?sid=secret-token";
    expect(redactFrontdoorUrl(url)).toBe(
      "https://myorg.my.salesforce.com/secur/frontdoor.jsp?sid=[REDACTED]"
    );
  });

  test("returns URL unchanged if no sid parameter", () => {
    const url = "https://myorg.my.salesforce.com/home";
    expect(redactFrontdoorUrl(url)).toBe(url);
  });
});
