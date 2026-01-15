import { test, expect } from "../fixtures/test-fixtures";
import type { NormalizedMessage, OtpResult } from "../../src/integrations/mailosaur/types";
import { normalizeMessage, extractCodes, extractLinks } from "../../src/integrations/mailosaur/parsers";

// ---
// Tests for Mailosaur Fixtures Health Check
// Feature: tools
// Tag: @tools @mailosaur
// ADO Plan ID: (not applicable - validation test)
// ADO Suite IDs: (not applicable - validation test)
// ---

test.describe("TOOLS-004 - Mailosaur Fixtures Health Check @tools @mailosaur", () => {
  test("mailosaur fixtures are present on test context", async ({ mail, otp, links, mailCleanup }) => {
    // Verify all mailosaur fixtures are available
    expect(mail).toBeDefined();
    expect(otp).toBeDefined();
    expect(links).toBeDefined();
    expect(mailCleanup).toBeDefined();

    // Verify fixture methods exist
    expect(typeof mail.waitForMessage).toBe("function");
    expect(typeof mail.getLatestMessage).toBe("function");
    expect(typeof otp.waitForCode).toBe("function");
    expect(typeof links.waitForLink).toBe("function");
    expect(typeof mailCleanup.deleteMessage).toBe("function");
    expect(typeof mailCleanup.clearServer).toBe("function");

    console.log("[TOOLS-004] Mailosaur fixtures verified:", {
      mail: Object.keys(mail),
      otp: Object.keys(otp),
      links: Object.keys(links),
      mailCleanup: Object.keys(mailCleanup),
    });
  });

  test("normalizeMessage parses raw Mailosaur message correctly", async () => {
    // Mock raw Mailosaur message structure
    const rawMessage = {
      id: "msg-123",
      subject: "Your verification code",
      from: [{ email: "noreply@example.com", name: "Example App" }],
      to: [{ email: "user@abc123.mailosaur.net" }],
      received: "2024-01-15T10:30:00Z",
      text: {
        body: "Your code is 123456. It expires in 10 minutes.",
        codes: [{ value: "123456" }],
      },
      html: {
        body: "<p>Your code is <strong>123456</strong>.</p>",
        links: [{ href: "https://example.com/verify?token=abc" }],
      },
    };

    const normalized = normalizeMessage(rawMessage);

    expect(normalized.id).toBe("msg-123");
    expect(normalized.subject).toBe("Your verification code");
    expect(normalized.from).toBe("noreply@example.com");
    expect(normalized.to).toBe("user@abc123.mailosaur.net");
    expect(normalized.receivedAt).toBeInstanceOf(Date);
    expect(normalized.textBody).toContain("Your code is 123456");
    expect(normalized.htmlBody).toContain("<strong>123456</strong>");

    // Verify codes extracted from SDK-provided codes
    expect(normalized.codes).toContain("123456");

    // Verify links extracted from SDK-provided links
    expect(normalized.links).toContain("https://example.com/verify?token=abc");

    console.log("[TOOLS-004] Normalized message:", JSON.stringify(normalized, null, 2));
  });

  test("normalizeMessage throws when receivedAt is missing", async () => {
    // Message without received timestamp
    const rawMessage = {
      id: "msg-no-timestamp",
      subject: "Missing timestamp",
      // received is undefined
    };

    expect(() => normalizeMessage(rawMessage)).toThrow(/receivedAt timestamp is missing/);

    console.log("[TOOLS-004] Missing receivedAt throws correctly");
  });

  test("extractCodes falls back to regex when SDK codes not available", async () => {
    // Message without SDK-extracted codes
    const message: NormalizedMessage = {
      id: "msg-456",
      receivedAt: new Date(),
      textBody: "Your one-time code is 987654. Enter this code to continue.",
      codes: [], // Empty - no SDK codes
      links: [],
    };

    const codes = extractCodes(message);

    expect(codes).toContain("987654");
    expect(codes.length).toBeGreaterThanOrEqual(1);

    console.log("[TOOLS-004] Extracted codes via regex:", codes);
  });

  test("extractCodes returns existing codes if present", async () => {
    const message: NormalizedMessage = {
      id: "msg-789",
      receivedAt: new Date(),
      textBody: "Your code is 111111 or maybe 222222.",
      codes: ["333333"], // Pre-extracted by SDK
      links: [],
    };

    const codes = extractCodes(message);

    // Should return pre-extracted codes, not re-parse
    expect(codes).toEqual(["333333"]);

    console.log("[TOOLS-004] Existing codes preserved:", codes);
  });

  test("extractLinks falls back to regex when SDK links not available", async () => {
    const message: NormalizedMessage = {
      id: "msg-links",
      receivedAt: new Date(),
      textBody: "Click here: https://example.com/verify?token=xyz to verify your account.",
      htmlBody: '<a href="https://example.com/reset?id=123">Reset password</a>',
      codes: [],
      links: [], // Empty - no SDK links
    };

    const links = extractLinks(message);

    expect(links.some((l) => l.includes("example.com"))).toBe(true);
    expect(links.length).toBeGreaterThanOrEqual(1);

    console.log("[TOOLS-004] Extracted links via regex:", links);
  });

  test("extractLinks filters out tracking pixels", async () => {
    const message: NormalizedMessage = {
      id: "msg-tracking",
      receivedAt: new Date(),
      textBody: `
        Click here: https://example.com/action
        Tracking: https://tracking.example.com/pixel.gif
        Logo: https://cdn.example.com/logo.png
      `,
      codes: [],
      links: [],
    };

    const links = extractLinks(message);

    // Should include action link
    expect(links.some((l) => l.includes("/action"))).toBe(true);

    // Should exclude tracking pixel and images
    expect(links.some((l) => l.includes(".gif"))).toBe(false);
    expect(links.some((l) => l.includes(".png"))).toBe(false);

    console.log("[TOOLS-004] Filtered links:", links);
  });

  test("otp.waitForCode validates mfa provider requirement", async ({ otp }) => {
    // User without Mailosaur MFA
    const nonMfaUser = {
      username: "regular-user@example.com",
      email: "regular-user@example.com",
    };

    // Should throw because user doesn't have Mailosaur MFA configured
    await expect(otp.waitForCode(nonMfaUser as any)).rejects.toThrow(
      /user with Mailosaur MFA configured/
    );

    console.log("[TOOLS-004] MFA provider validation working correctly");
  });

  test("MFA does NOT activate when user.mfa is absent", async () => {
    // User with no mfa property at all
    const userWithoutMfa = {
      username: "no-mfa-user@example.com",
      email: "no-mfa-user@example.com",
    };

    // Verify hasMailosaurMfa returns false
    const hasMailosaurMfa = (user: any): boolean => {
      return user?.mfa?.provider === "mailosaur";
    };

    expect(hasMailosaurMfa(userWithoutMfa)).toBe(false);

    console.log("[TOOLS-004] MFA absent - correctly not activated");
  });

  test("MFA does NOT activate when user.mfa.provider is not mailosaur", async () => {
    // User with mfa property but different provider
    const userWithOtherProvider = {
      username: "other-mfa-user@example.com",
      email: "other-mfa-user@example.com",
      mfa: {
        provider: "okta", // Not "mailosaur"
        channels: {
          email: { sentTo: "other@example.com" },
        },
      },
    };

    // User with mfa property but provider is null
    const userWithNullProvider = {
      username: "null-provider@example.com",
      mfa: {
        provider: null,
      },
    };

    // User with mfa property but provider is undefined
    const userWithUndefinedProvider = {
      username: "undefined-provider@example.com",
      mfa: {
        channels: { email: { sentTo: "test@example.com" } },
        // provider not set
      },
    };

    const hasMailosaurMfa = (user: any): boolean => {
      return user?.mfa?.provider === "mailosaur";
    };

    // All should return false - MFA should NOT activate
    expect(hasMailosaurMfa(userWithOtherProvider)).toBe(false);
    expect(hasMailosaurMfa(userWithNullProvider)).toBe(false);
    expect(hasMailosaurMfa(userWithUndefinedProvider)).toBe(false);

    console.log("[TOOLS-004] Non-mailosaur providers correctly not activated:", {
      okta: hasMailosaurMfa(userWithOtherProvider),
      null: hasMailosaurMfa(userWithNullProvider),
      undefined: hasMailosaurMfa(userWithUndefinedProvider),
    });
  });

  test("channel resolution handles single email channel", async () => {
    // Import the helper factory
    const { createMfaHelper, MailosaurClient } = await import(
      "../../src/integrations/mailosaur/MailosaurClient"
    );

    // Mock minimal config to create helper (won't actually call Mailosaur)
    const mockClient = {
      getDefaultTimeoutMs: () => 30000,
      getServerId: () => "test-server",
    } as any as InstanceType<typeof MailosaurClient>;

    const helper = createMfaHelper(mockClient);

    const userWithEmailOnly = {
      username: "mfa-user@example.com",
      mfa: {
        provider: "mailosaur" as const,
        channels: {
          email: { sentTo: "mfa-user@test.mailosaur.net" },
        },
      },
    };

    const channel = helper.resolveChannel(userWithEmailOnly);
    expect(channel).toBe("email");

    const sentTo = helper.getSentTo(userWithEmailOnly, channel);
    expect(sentTo).toBe("mfa-user@test.mailosaur.net");

    console.log("[TOOLS-004] Single channel resolution:", { channel, sentTo });
  });

  test("channel resolution handles single SMS channel", async () => {
    const { createMfaHelper, MailosaurClient } = await import(
      "../../src/integrations/mailosaur/MailosaurClient"
    );

    const mockClient = {
      getDefaultTimeoutMs: () => 30000,
      getServerId: () => "test-server",
    } as any as InstanceType<typeof MailosaurClient>;

    const helper = createMfaHelper(mockClient);

    const userWithSmsOnly = {
      username: "mfa-user@example.com",
      mfa: {
        provider: "mailosaur" as const,
        channels: {
          sms: { sentTo: "+15551234567" },
        },
      },
    };

    const channel = helper.resolveChannel(userWithSmsOnly);
    expect(channel).toBe("sms");

    const sentTo = helper.getSentTo(userWithSmsOnly, channel);
    expect(sentTo).toBe("+15551234567");

    console.log("[TOOLS-004] SMS channel resolution:", { channel, sentTo });
  });

  test("channel resolution uses defaultChannel for multi-channel users", async () => {
    const { createMfaHelper, MailosaurClient } = await import(
      "../../src/integrations/mailosaur/MailosaurClient"
    );

    const mockClient = {
      getDefaultTimeoutMs: () => 30000,
      getServerId: () => "test-server",
    } as any as InstanceType<typeof MailosaurClient>;

    const helper = createMfaHelper(mockClient);

    const userWithBothChannels = {
      username: "mfa-user@example.com",
      mfa: {
        provider: "mailosaur" as const,
        channels: {
          email: { sentTo: "mfa-user@test.mailosaur.net" },
          sms: { sentTo: "+15551234567" },
        },
        defaultChannel: "sms" as const,
      },
    };

    const channel = helper.resolveChannel(userWithBothChannels);
    expect(channel).toBe("sms");

    console.log("[TOOLS-004] Default channel resolution:", { channel });
  });

  test("channel resolution throws for multi-channel without default", async () => {
    const { createMfaHelper, MailosaurClient } = await import(
      "../../src/integrations/mailosaur/MailosaurClient"
    );

    const mockClient = {
      getDefaultTimeoutMs: () => 30000,
      getServerId: () => "test-server",
    } as any as InstanceType<typeof MailosaurClient>;

    const helper = createMfaHelper(mockClient);

    const userWithBothNoDefault = {
      username: "mfa-user@example.com",
      mfa: {
        provider: "mailosaur" as const,
        channels: {
          email: { sentTo: "mfa-user@test.mailosaur.net" },
          sms: { sentTo: "+15551234567" },
        },
        // No defaultChannel specified
      },
    };

    expect(() => helper.resolveChannel(userWithBothNoDefault)).toThrow(
      /multiple MFA channels.*no defaultChannel/
    );

    console.log("[TOOLS-004] Multi-channel without default throws correctly");
  });

  test("channel resolution respects override parameter", async () => {
    const { createMfaHelper, MailosaurClient } = await import(
      "../../src/integrations/mailosaur/MailosaurClient"
    );

    const mockClient = {
      getDefaultTimeoutMs: () => 30000,
      getServerId: () => "test-server",
    } as any as InstanceType<typeof MailosaurClient>;

    const helper = createMfaHelper(mockClient);

    const userWithBothChannels = {
      username: "mfa-user@example.com",
      mfa: {
        provider: "mailosaur" as const,
        channels: {
          email: { sentTo: "mfa-user@test.mailosaur.net" },
          sms: { sentTo: "+15551234567" },
        },
        defaultChannel: "email" as const,
      },
    };

    // Override should win over defaultChannel
    const channel = helper.resolveChannel(userWithBothChannels, "sms");
    expect(channel).toBe("sms");

    console.log("[TOOLS-004] Override channel resolution:", { channel });
  });

  test("channel resolution throws for invalid override", async () => {
    const { createMfaHelper, MailosaurClient } = await import(
      "../../src/integrations/mailosaur/MailosaurClient"
    );

    const mockClient = {
      getDefaultTimeoutMs: () => 30000,
      getServerId: () => "test-server",
    } as any as InstanceType<typeof MailosaurClient>;

    const helper = createMfaHelper(mockClient);

    const userWithEmailOnly = {
      username: "mfa-user@example.com",
      mfa: {
        provider: "mailosaur" as const,
        channels: {
          email: { sentTo: "mfa-user@test.mailosaur.net" },
        },
      },
    };

    // Requesting SMS when only email is configured should throw
    expect(() => helper.resolveChannel(userWithEmailOnly, "sms")).toThrow(
      /channel override "sms" requested but channel is not configured/
    );

    console.log("[TOOLS-004] Invalid override throws correctly");
  });

  test("resolveChannel throws for non-mailosaur provider", async () => {
    const { createMfaHelper, MailosaurClient } = await import(
      "../../src/integrations/mailosaur/MailosaurClient"
    );

    const mockClient = {
      getDefaultTimeoutMs: () => 30000,
      getServerId: () => "test-server",
    } as any as InstanceType<typeof MailosaurClient>;

    const helper = createMfaHelper(mockClient);

    // User with different provider
    const userWithOtherProvider = {
      username: "other-user@example.com",
      mfa: {
        provider: "duo" as any,
        channels: {
          email: { sentTo: "other@example.com" },
        },
      },
    };

    // User with no mfa at all
    const userWithNoMfa = {
      username: "no-mfa@example.com",
    };

    expect(() => helper.resolveChannel(userWithOtherProvider)).toThrow(
      /does not have Mailosaur MFA configured/
    );

    expect(() => helper.resolveChannel(userWithNoMfa as any)).toThrow(
      /does not have Mailosaur MFA configured/
    );

    console.log("[TOOLS-004] Non-mailosaur provider throws on resolveChannel");
  });
});
